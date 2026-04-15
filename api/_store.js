const MEMORY_LIMIT = 100;
const ROOM_STATE_KEY = "chatapp:room-state";
const PRESENCE_TTL_MS = 35_000;
const TYPING_TTL_MS = 8_000;

let kvClient = null;
try {
  ({ kv: kvClient } = require("@vercel/kv"));
} catch (error) {
  kvClient = null;
}

if (!globalThis.__CHATAPP_MEM__) {
  globalThis.__CHATAPP_MEM__ = [];
}

if (!globalThis.__CHATAPP_ROOM_STATE__) {
  globalThis.__CHATAPP_ROOM_STATE__ = {};
}

const memoryStore = globalThis.__CHATAPP_MEM__;
const memoryRoomState = globalThis.__CHATAPP_ROOM_STATE__;

function hasKvConfig() {
  return Boolean(kvClient || (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN));
}

async function kvRequest(path, options = {}) {
  const baseUrl = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`KV request failed: ${response.status} ${body}`);
  }

  return response.json();
}

async function readFromKv() {
  if (kvClient) {
    const value = await kvClient.get("chatapp:messages");

    if (!value) {
      return [];
    }

    return Array.isArray(value) ? value : JSON.parse(value);
  }

  const payload = await kvRequest("/get/chatapp:messages");
  const value = payload.result;

  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    return JSON.parse(value);
  }

  return value;
}

async function writeToKv(messages) {
  if (kvClient) {
    await kvClient.set("chatapp:messages", messages);
    return;
  }

  await kvRequest("/set/chatapp:messages", {
    method: "POST",
    body: JSON.stringify(messages)
  });
}

function readFromMemory() {
  return memoryStore;
}

function writeToMemory(messages) {
  memoryStore.length = 0;
  memoryStore.push(...messages.slice(-MEMORY_LIMIT));
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages.slice(-MEMORY_LIMIT);
}

function normalizeRoom(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 24);
}

function normalizeUser(value) {
  return String(value || "").trim().toLowerCase().slice(0, 32);
}

function normalizeMemberRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (role === "cohost") {
    return "cohost";
  }
  if (role === "moderator") {
    return "moderator";
  }
  return "member";
}

function emptyRoomState() {
  return {
    host: "",
    roles: {},
    muted: [],
    mutedUntil: {},
    banned: [],
    bannedUntil: {},
    kicked: [],
    presence: {},
    typing: {},
    moderationLog: []
  };
}

function normalizeRoomState(state) {
  const next = state || emptyRoomState();
  const presence = next.presence && typeof next.presence === "object" ? next.presence : {};
  const typing = next.typing && typeof next.typing === "object" ? next.typing : {};
  const roles = next.roles && typeof next.roles === "object" ? next.roles : {};
  const mutedUntil = next.mutedUntil && typeof next.mutedUntil === "object" ? next.mutedUntil : {};
  const bannedUntil = next.bannedUntil && typeof next.bannedUntil === "object" ? next.bannedUntil : {};

  const normalizedRoles = {};
  for (const [user, role] of Object.entries(roles)) {
    const normalizedUser = normalizeUser(user);
    const normalizedRole = normalizeMemberRole(role);
    if (normalizedUser && normalizedRole !== "member") {
      normalizedRoles[normalizedUser] = normalizedRole;
    }
  }

  const normalizedMutedUntil = {};
  for (const [user, untilTs] of Object.entries(mutedUntil)) {
    const normalizedUser = normalizeUser(user);
    const numeric = Number(untilTs || 0);
    if (normalizedUser && Number.isFinite(numeric) && numeric > 0) {
      normalizedMutedUntil[normalizedUser] = numeric;
    }
  }

  const normalizedBannedUntil = {};
  for (const [user, untilTs] of Object.entries(bannedUntil)) {
    const normalizedUser = normalizeUser(user);
    const numeric = Number(untilTs || 0);
    if (normalizedUser && Number.isFinite(numeric) && numeric > 0) {
      normalizedBannedUntil[normalizedUser] = numeric;
    }
  }

  return {
    host: normalizeUser(next.host),
    roles: normalizedRoles,
    muted: Array.isArray(next.muted) ? [...new Set(next.muted.map(normalizeUser).filter(Boolean))] : [],
    mutedUntil: normalizedMutedUntil,
    banned: Array.isArray(next.banned) ? [...new Set(next.banned.map(normalizeUser).filter(Boolean))] : [],
    bannedUntil: normalizedBannedUntil,
    kicked: Array.isArray(next.kicked) ? [...new Set(next.kicked.map(normalizeUser).filter(Boolean))] : [],
    presence,
    typing,
    moderationLog: Array.isArray(next.moderationLog) ? next.moderationLog.slice(-100) : []
  };
}

function cleanupTemporalState(state) {
  const now = Date.now();
  const next = normalizeRoomState(state);
  const cleanedPresence = {};
  for (const [user, ts] of Object.entries(next.presence)) {
    if (now - Number(ts || 0) <= PRESENCE_TTL_MS) {
      cleanedPresence[normalizeUser(user)] = Number(ts || 0);
    }
  }

  const cleanedTyping = {};
  for (const [user, ts] of Object.entries(next.typing)) {
    if (now - Number(ts || 0) <= TYPING_TTL_MS) {
      cleanedTyping[normalizeUser(user)] = Number(ts || 0);
    }
  }

  next.presence = cleanedPresence;
  next.typing = cleanedTyping;

  const activeMuted = [];
  for (const user of next.muted) {
    const until = Number(next.mutedUntil[user] || 0);
    if (!until || until > now) {
      activeMuted.push(user);
      if (until) {
        next.mutedUntil[user] = until;
      } else {
        delete next.mutedUntil[user];
      }
    } else {
      delete next.mutedUntil[user];
    }
  }
  next.muted = activeMuted;

  const activeBanned = [];
  for (const user of next.banned) {
    const until = Number(next.bannedUntil[user] || 0);
    if (!until || until > now) {
      activeBanned.push(user);
      if (until) {
        next.bannedUntil[user] = until;
      } else {
        delete next.bannedUntil[user];
      }
    } else {
      delete next.bannedUntil[user];
      next.kicked = next.kicked.filter((entry) => entry !== user);
    }
  }
  next.banned = activeBanned;

  return next;
}

function roleForUser(state, user) {
  const normalizedUser = normalizeUser(user);
  if (!normalizedUser) {
    return "member";
  }
  if (normalizeUser(state.host) === normalizedUser) {
    return "host";
  }
  return normalizeMemberRole(state.roles[normalizedUser]);
}

function canModerate(action, actorRole) {
  if (actorRole === "host") {
    return true;
  }
  if (actorRole === "cohost" || actorRole === "moderator") {
    return action === "mute" || action === "unmute" || action === "kick" || action === "unkick";
  }
  return false;
}

async function readRoomStatesFromKv() {
  if (kvClient) {
    const value = await kvClient.get(ROOM_STATE_KEY);
    return value && typeof value === "object" ? value : {};
  }

  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const payload = await kvRequest(`/get/${ROOM_STATE_KEY}`);
    const value = payload.result;
    if (!value) {
      return {};
    }
    return typeof value === "string" ? JSON.parse(value) : value;
  }

  return memoryRoomState;
}

async function writeRoomStatesToKv(states) {
  if (kvClient) {
    await kvClient.set(ROOM_STATE_KEY, states);
    return;
  }

  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    await kvRequest(`/set/${ROOM_STATE_KEY}`, {
      method: "POST",
      body: JSON.stringify(states)
    });
    return;
  }

  Object.keys(memoryRoomState).forEach((key) => {
    delete memoryRoomState[key];
  });
  Object.assign(memoryRoomState, states);
}

async function readRoomState(room) {
  const normalizedRoom = normalizeRoom(room);
  const states = await readRoomStatesFromKv();
  const current = cleanupTemporalState(states[normalizedRoom]);
  return {
    room: normalizedRoom,
    all: states,
    current
  };
}

async function writeRoomState(room, allStates, currentState) {
  const normalizedRoom = normalizeRoom(room);
  allStates[normalizedRoom] = normalizeRoomState(currentState);
  await writeRoomStatesToKv(allStates);
}

function hasAccess(roomState, user) {
  const normalizedUser = normalizeUser(user);
  return {
    muted: roomState.muted.includes(normalizedUser),
    banned: roomState.banned.includes(normalizedUser),
    kicked: roomState.kicked.includes(normalizedUser)
  };
}

async function listMessages(room, user) {
  const normalizedRoom = normalizeRoom(room);
  const roomStateBundle = await readRoomState(normalizedRoom);
  await writeRoomState(normalizedRoom, roomStateBundle.all, roomStateBundle.current);
  const myRole = roleForUser(roomStateBundle.current, user);

  const access = hasAccess(roomStateBundle.current, user);

  if (hasKvConfig()) {
    const allMessages = normalizeMessages(await readFromKv());
    const roomMessages = normalizedRoom
      ? allMessages.filter((message) => {
          const sameRoom = normalizeRoom(message.room) === normalizedRoom;
          if (!sameRoom) {
            return false;
          }
          if (message.type === "dm") {
            const normalizedUser = normalizeUser(user);
            return normalizeUser(message.user) === normalizedUser || normalizeUser(message.to) === normalizedUser;
          }
          return true;
        })
      : allMessages;

    const onlineUsers = Object.keys(roomStateBundle.current.presence).sort();
    const typingUsers = Object.keys(roomStateBundle.current.typing).filter((entry) => entry !== normalizeUser(user));

    return {
      storage: "kv",
      roomHost: roomStateBundle.current.host,
      myRole,
      onlineUsers,
      typingUsers,
      moderation: {
        roles: roomStateBundle.current.roles,
        muted: roomStateBundle.current.muted,
        mutedUntil: roomStateBundle.current.mutedUntil,
        banned: roomStateBundle.current.banned,
        bannedUntil: roomStateBundle.current.bannedUntil,
        kicked: roomStateBundle.current.kicked,
        log: roomStateBundle.current.moderationLog
      },
      access,
      messages: access.banned || access.kicked ? [] : roomMessages
    };
  }

  const allMessages = normalizeMessages(readFromMemory());
  const roomMessages = normalizedRoom
    ? allMessages.filter((message) => {
        const sameRoom = normalizeRoom(message.room) === normalizedRoom;
        if (!sameRoom) {
          return false;
        }
        if (message.type === "dm") {
          const normalizedUser = normalizeUser(user);
          return normalizeUser(message.user) === normalizedUser || normalizeUser(message.to) === normalizedUser;
        }
        return true;
      })
    : allMessages;

  const onlineUsers = Object.keys(roomStateBundle.current.presence).sort();
  const typingUsers = Object.keys(roomStateBundle.current.typing).filter((entry) => entry !== normalizeUser(user));

  return {
    storage: "memory",
    roomHost: roomStateBundle.current.host,
    myRole,
    onlineUsers,
    typingUsers,
    moderation: {
      roles: roomStateBundle.current.roles,
      muted: roomStateBundle.current.muted,
      mutedUntil: roomStateBundle.current.mutedUntil,
      banned: roomStateBundle.current.banned,
      bannedUntil: roomStateBundle.current.bannedUntil,
      kicked: roomStateBundle.current.kicked,
      log: roomStateBundle.current.moderationLog
    },
    access,
    messages: access.banned || access.kicked ? [] : roomMessages
  };
}

async function appendMessage(message) {
  const roomStateBundle = await readRoomState(message.room);
  const normalizedUser = normalizeUser(message.user);
  const access = hasAccess(roomStateBundle.current, normalizedUser);

  if (access.banned) {
    return { denied: "banned" };
  }
  if (access.kicked) {
    return { denied: "kicked" };
  }
  if (access.muted) {
    return { denied: "muted" };
  }

  // First sender becomes host if the room does not have one yet.
  if (!roomStateBundle.current.host) {
    roomStateBundle.current.host = normalizedUser;
    await writeRoomState(message.room, roomStateBundle.all, roomStateBundle.current);
  }

  const next = {
    id: message.id,
    user: message.user,
    to: normalizeUser(message.to),
    room: normalizeRoom(message.room),
    type: message.to ? "dm" : "room",
    role: roomStateBundle.current.host && normalizeUser(roomStateBundle.current.host) === normalizedUser ? "host" : "member",
    replyTo: message.replyTo && typeof message.replyTo === "object"
      ? {
          id: String(message.replyTo.id || "").trim().slice(0, 64),
          user: String(message.replyTo.user || "").trim().slice(0, 32),
          text: String(message.replyTo.text || "").trim().slice(0, 160)
        }
      : null,
    text: message.text,
    editedAt: "",
    deleted: false,
    ts: message.ts
  };

  if (hasKvConfig()) {
    const current = normalizeMessages(await readFromKv());
    current.push(next);
    await writeToKv(current);
    return { storage: "kv", messages: current.slice(-MEMORY_LIMIT) };
  }

  const current = normalizeMessages(readFromMemory());
  current.push(next);
  writeToMemory(current);
  return { storage: "memory", messages: current.slice(-MEMORY_LIMIT) };
}

async function moderateRoom(payload) {
  const room = normalizeRoom(payload.room);
  const actor = normalizeUser(payload.actor);
  const target = normalizeUser(payload.target);
  const action = String(payload.action || "").trim().toLowerCase();
  const requestedRole = normalizeMemberRole(payload.targetRole);
  const durationMs = Math.max(0, Number(payload.durationMs || 0));

  if (!room || !actor || !target) {
    return { ok: false, error: "room, actor, and target are required." };
  }

  const roomStateBundle = await readRoomState(room);
  const state = roomStateBundle.current;
  const actorRole = roleForUser(state, actor);
  const targetRole = roleForUser(state, target);

  if (!canModerate(action, actorRole) && !(actorRole === "host" && (action === "setrole" || action === "clearrole"))) {
    return { ok: false, error: "You do not have permission for this action.", code: 403 };
  }

  if (target === state.host) {
    return { ok: false, error: "Host cannot moderate themselves.", code: 400 };
  }

  if (actorRole !== "host" && targetRole !== "member") {
    return { ok: false, error: "You can only moderate members.", code: 403 };
  }

  if (action === "mute") {
    state.muted = [...new Set([...state.muted, target])];
    if (durationMs > 0) {
      state.mutedUntil[target] = Date.now() + durationMs;
    } else {
      delete state.mutedUntil[target];
    }
  } else if (action === "unmute") {
    state.muted = state.muted.filter((user) => user !== target);
    delete state.mutedUntil[target];
  } else if (action === "ban") {
    state.banned = [...new Set([...state.banned, target])];
    state.kicked = [...new Set([...state.kicked, target])];
    if (durationMs > 0) {
      state.bannedUntil[target] = Date.now() + durationMs;
    } else {
      delete state.bannedUntil[target];
    }
    delete state.presence[target];
    delete state.typing[target];
  } else if (action === "unban") {
    state.banned = state.banned.filter((user) => user !== target);
    delete state.bannedUntil[target];
  } else if (action === "unkick") {
    state.kicked = state.kicked.filter((user) => user !== target);
  } else if (action === "kick") {
    state.kicked = [...new Set([...state.kicked, target])];
    delete state.presence[target];
    delete state.typing[target];
  } else if (action === "setrole") {
    if (actorRole !== "host") {
      return { ok: false, error: "Only host can assign roles.", code: 403 };
    }
    if (requestedRole === "member") {
      delete state.roles[target];
    } else {
      state.roles[target] = requestedRole;
    }
  } else if (action === "clearrole") {
    if (actorRole !== "host") {
      return { ok: false, error: "Only host can clear roles.", code: 403 };
    }
    delete state.roles[target];
  } else {
    return { ok: false, error: "Unsupported moderation action.", code: 400 };
  }

  state.moderationLog = [...state.moderationLog, {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    actor,
    action,
    target,
    ts: new Date().toISOString()
  }].slice(-100);

  await writeRoomState(room, roomStateBundle.all, state);
  return {
    ok: true,
    roomHost: state.host,
    roles: state.roles,
    muted: state.muted,
    mutedUntil: state.mutedUntil,
    banned: state.banned,
    bannedUntil: state.bannedUntil,
    kicked: state.kicked
  };
}

async function setPresence(payload) {
  const room = normalizeRoom(payload.room);
  const user = normalizeUser(payload.user);
  const active = payload.active !== false;

  if (!room || !user) {
    return { ok: false, error: "room and user are required.", code: 400 };
  }

  const roomStateBundle = await readRoomState(room);
  const state = roomStateBundle.current;
  const access = hasAccess(state, user);

  if (access.banned || access.kicked) {
    delete state.presence[user];
    delete state.typing[user];
    await writeRoomState(room, roomStateBundle.all, state);
    return {
      ok: false,
      code: 403,
      error: access.banned ? "banned" : "kicked"
    };
  }

  if (active) {
    state.presence[user] = Date.now();
  } else {
    delete state.presence[user];
    delete state.typing[user];
  }

  await writeRoomState(room, roomStateBundle.all, state);
  return { ok: true, onlineUsers: Object.keys(state.presence).sort() };
}

async function setTyping(payload) {
  const room = normalizeRoom(payload.room);
  const user = normalizeUser(payload.user);
  const active = payload.active !== false;

  if (!room || !user) {
    return { ok: false, error: "room and user are required.", code: 400 };
  }

  const roomStateBundle = await readRoomState(room);
  const state = roomStateBundle.current;
  const access = hasAccess(state, user);

  if (access.banned || access.kicked) {
    delete state.typing[user];
    await writeRoomState(room, roomStateBundle.all, state);
    return {
      ok: false,
      code: 403,
      error: access.banned ? "banned" : "kicked"
    };
  }

  if (active) {
    state.typing[user] = Date.now();
  } else {
    delete state.typing[user];
  }

  await writeRoomState(room, roomStateBundle.all, state);
  return { ok: true, typingUsers: Object.keys(state.typing).sort() };
}

async function applyMessageAction(payload) {
  const room = normalizeRoom(payload.room);
  const actor = normalizeUser(payload.actor);
  const action = String(payload.action || "").trim().toLowerCase();
  const messageId = String(payload.messageId || "").trim();
  const text = String(payload.text || "").trim().slice(0, 500);

  if (!room || !actor || !messageId) {
    return { ok: false, error: "room, actor and messageId are required.", code: 400 };
  }

  const roomStateBundle = await readRoomState(room);
  const host = roomStateBundle.current.host;
  const allMessages = hasKvConfig() ? normalizeMessages(await readFromKv()) : normalizeMessages(readFromMemory());
  const index = allMessages.findIndex((message) => message.id === messageId && normalizeRoom(message.room) === room);

  if (index < 0) {
    return { ok: false, error: "Message not found.", code: 404 };
  }

  const message = allMessages[index];
  const isOwner = normalizeUser(message.user) === actor;
  const isHost = host && host === actor;

  if (action === "edit") {
    if (!isOwner) {
      return { ok: false, error: "Only message owner can edit.", code: 403 };
    }
    if (!text) {
      return { ok: false, error: "Edited text is required.", code: 400 };
    }
    message.text = text;
    message.editedAt = new Date().toISOString();
  } else if (action === "delete") {
    if (!isOwner && !isHost) {
      return { ok: false, error: "Only owner or host can delete.", code: 403 };
    }
    message.deleted = true;
    message.text = isHost && !isOwner ? "[deleted by host]" : "[deleted]";
    message.editedAt = new Date().toISOString();
  } else {
    return { ok: false, error: "Unsupported message action.", code: 400 };
  }

  if (hasKvConfig()) {
    await writeToKv(allMessages);
  } else {
    writeToMemory(allMessages);
  }

  return { ok: true };
}

module.exports = {
  listMessages,
  appendMessage,
  moderateRoom,
  setPresence,
  setTyping,
  applyMessageAction
};
