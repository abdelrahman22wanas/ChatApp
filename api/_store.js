const MEMORY_LIMIT = 100;
const ROOM_STATE_KEY = "chatapp:room-state";

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

function normalizeRole(value) {
  if (String(value || "").trim().toLowerCase() === "host") {
    return "host";
  }
  return "member";
}

function emptyRoomState() {
  return {
    host: "",
    muted: [],
    banned: [],
    kicked: []
  };
}

function normalizeRoomState(state) {
  const next = state || emptyRoomState();
  return {
    host: normalizeUser(next.host),
    muted: Array.isArray(next.muted) ? [...new Set(next.muted.map(normalizeUser).filter(Boolean))] : [],
    banned: Array.isArray(next.banned) ? [...new Set(next.banned.map(normalizeUser).filter(Boolean))] : [],
    kicked: Array.isArray(next.kicked) ? [...new Set(next.kicked.map(normalizeUser).filter(Boolean))] : []
  };
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
  return {
    room: normalizedRoom,
    all: states,
    current: normalizeRoomState(states[normalizedRoom])
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
  const access = hasAccess(roomStateBundle.current, user);

  if (access.kicked) {
    roomStateBundle.current.kicked = roomStateBundle.current.kicked.filter((entry) => entry !== normalizeUser(user));
    await writeRoomState(normalizedRoom, roomStateBundle.all, roomStateBundle.current);
  }

  if (hasKvConfig()) {
    const allMessages = normalizeMessages(await readFromKv());
    const roomMessages = normalizedRoom ? allMessages.filter((message) => normalizeRoom(message.room) === normalizedRoom) : allMessages;
    return {
      storage: "kv",
      roomHost: roomStateBundle.current.host,
      access,
      messages: access.banned || access.kicked ? [] : roomMessages
    };
  }

  const allMessages = normalizeMessages(readFromMemory());
  const roomMessages = normalizedRoom ? allMessages.filter((message) => normalizeRoom(message.room) === normalizedRoom) : allMessages;
  return {
    storage: "memory",
    roomHost: roomStateBundle.current.host,
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

  if (!roomStateBundle.current.host && normalizeRole(message.role) === "host") {
    roomStateBundle.current.host = normalizedUser;
    await writeRoomState(message.room, roomStateBundle.all, roomStateBundle.current);
  }

  const next = {
    id: message.id,
    user: message.user,
    room: normalizeRoom(message.room),
    role: roomStateBundle.current.host && normalizeUser(roomStateBundle.current.host) === normalizedUser ? "host" : "member",
    text: message.text,
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
  const actorRole = normalizeRole(payload.actorRole);
  const target = normalizeUser(payload.target);
  const action = String(payload.action || "").trim().toLowerCase();

  if (!room || !actor || !target) {
    return { ok: false, error: "room, actor, and target are required." };
  }

  const roomStateBundle = await readRoomState(room);
  const state = roomStateBundle.current;

  if (!state.host && actorRole === "host") {
    state.host = actor;
  }

  if (state.host !== actor) {
    return { ok: false, error: "Only the room host can moderate users.", code: 403 };
  }

  if (target === state.host) {
    return { ok: false, error: "Host cannot moderate themselves.", code: 400 };
  }

  if (action === "mute") {
    state.muted = [...new Set([...state.muted, target])];
  } else if (action === "unmute") {
    state.muted = state.muted.filter((user) => user !== target);
  } else if (action === "ban") {
    state.banned = [...new Set([...state.banned, target])];
    state.kicked = [...new Set([...state.kicked, target])];
  } else if (action === "unban") {
    state.banned = state.banned.filter((user) => user !== target);
  } else if (action === "kick") {
    state.kicked = [...new Set([...state.kicked, target])];
  } else {
    return { ok: false, error: "Unsupported moderation action.", code: 400 };
  }

  await writeRoomState(room, roomStateBundle.all, state);
  return {
    ok: true,
    roomHost: state.host,
    muted: state.muted,
    banned: state.banned,
    kicked: state.kicked
  };
}

module.exports = {
  listMessages,
  appendMessage,
  moderateRoom
};
