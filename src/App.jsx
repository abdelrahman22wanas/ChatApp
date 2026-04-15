import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

const POLL_MS = 2000;
const USER_KEY = "chatapp.web.user";
const ROOM_KEY = "chatapp.web.room";
const MODE_KEY = "chatapp.web.mode";
const ROLE_KEY = "chatapp.web.role";
const SOUND_MODE_KEY = "chatapp.web.soundMode";
const LEFT_PANEL_WIDTH_KEY = "chatapp.web.leftPanelWidth";
const THEME_KEY = "chatapp.web.theme";
const TAB_INACTIVE_MS = 180_000;

function roomCacheKey(room) {
  return `chatapp.web.room.messages.${room}`;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isMentionedMessage(text, username) {
  const cleanUser = String(username || "").trim();
  if (!cleanUser) {
    return false;
  }

  const mentionRegex = new RegExp(`(^|\\s)@${escapeRegExp(cleanUser)}(\\b|$)`, "i");
  return mentionRegex.test(String(text || ""));
}

export default function App({ authRequired = false, authUser = null, getToken = null }) {
  const savedUser = localStorage.getItem(USER_KEY) || "";
  const savedRoom = localStorage.getItem(ROOM_KEY) || "";
  const savedMode = localStorage.getItem(MODE_KEY) || "join";

  const [user, setUser] = useState(() => localStorage.getItem(USER_KEY) || "");
  const [nameInput, setNameInput] = useState(() => localStorage.getItem(USER_KEY) || "");
  const [roomInput, setRoomInput] = useState("");
  const [room, setRoom] = useState(() => localStorage.getItem(ROOM_KEY) || "");
  const [mode, setMode] = useState(() => localStorage.getItem(MODE_KEY) || "join");
  const [role, setRole] = useState(() => localStorage.getItem(ROLE_KEY) || "member");
  const [isReady, setIsReady] = useState(false);
  const [messages, setMessages] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [text, setText] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [moderationInfo, setModerationInfo] = useState({
    roles: {},
    muted: [],
    mutedUntil: {},
    banned: [],
    bannedUntil: {},
    kicked: [],
    log: []
  });
  const [replyTo, setReplyTo] = useState(null);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, message: null });
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    const value = Number(localStorage.getItem(LEFT_PANEL_WIDTH_KEY) || 300);
    return Number.isFinite(value) ? value : 300;
  });
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === "dark" || savedTheme === "light") {
      return savedTheme;
    }
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [activeResizer, setActiveResizer] = useState("");
  const [soundMode, setSoundMode] = useState(() => localStorage.getItem(SOUND_MODE_KEY) || "all");
  const [status, setStatus] = useState("Set your name and start or join a room.");
  const [statusMode, setStatusMode] = useState("");
  const [storage, setStorage] = useState("memory");
  const chatLayoutRef = useRef(null);
  const messagesRef = useRef(null);
  const inactivityTimerRef = useRef(null);
  const hasLoadedMessagesRef = useRef(false);
  const lastMessageIdRef = useRef("");
  const typingOffTimerRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const isFetchingMessagesRef = useRef(false);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const memberDirectory = useMemo(() => {
    const users = new Map();
    for (const onlineUser of onlineUsers) {
      if (onlineUser) {
        users.set(String(onlineUser).toLowerCase(), onlineUser);
      }
    }
    for (const message of messages) {
      if (message.user) {
        users.set(String(message.user).toLowerCase(), message.user);
      }
    }
    for (const mutedUser of moderationInfo.muted || []) {
      users.set(String(mutedUser).toLowerCase(), mutedUser);
    }
    for (const bannedUser of moderationInfo.banned || []) {
      users.set(String(bannedUser).toLowerCase(), bannedUser);
    }
    for (const kickedUser of moderationInfo.kicked || []) {
      users.set(String(kickedUser).toLowerCase(), kickedUser);
    }

    return [...users.values()].sort((a, b) => a.localeCompare(b));
  }, [messages, moderationInfo, onlineUsers]);

  const participantList = memberDirectory;
  const participantCount = memberDirectory.length;

  const filteredMessages = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    if (!query) {
      return messages;
    }

    return messages.filter((message) => {
      const haystacks = [
        message.user,
        message.text,
        message.to,
        message.type,
        message.ts,
        message.role,
        message.replyTo?.user,
        message.replyTo?.text
      ];
      return haystacks.some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [messages, deferredSearchQuery]);

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  function memberRole(memberName) {
    const normalized = String(memberName || "").toLowerCase();
    if (!normalized) {
      return "member";
    }
    if (normalized === String(user || "").toLowerCase()) {
      return role;
    }
    const mapped = moderationInfo.roles?.[normalized];
    if (mapped === "cohost" || mapped === "moderator") {
      return mapped;
    }
    return "member";
  }

  function attachmentKind(attachment) {
    const type = String(attachment?.type || "");
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/")) return "video";
    if (type.startsWith("audio/")) return "audio";
    return "file";
  }

  function roleCanModerate(currentRole) {
    return currentRole === "host" || currentRole === "cohost" || currentRole === "moderator";
  }

  function roleCanBan(currentRole) {
    return currentRole === "host";
  }

  function roleCanManageRoles(currentRole) {
    return currentRole === "host";
  }

  function parseDurationMs(actionName) {
    const defaultMinutes = actionName === "ban" ? "60" : "10";
    const input = window.prompt(
      `Duration in minutes for ${actionName} (leave empty for permanent):`,
      defaultMinutes
    );
    if (input === null) {
      return null;
    }
    const trimmed = String(input).trim();
    if (!trimmed) {
      return 0;
    }
    const parsedMinutes = Number(trimmed);
    if (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
      applyStatus("Invalid duration. Enter a positive number of minutes.", "warn");
      return null;
    }
    return Math.round(parsedMinutes * 60_000);
  }

  function formatRemaining(ts) {
    const endTs = Number(ts || 0);
    if (!endTs) {
      return "";
    }
    const diff = endTs - Date.now();
    if (diff <= 0) {
      return "";
    }
    const totalMinutes = Math.ceil(diff / 60_000);
    if (totalMinutes < 60) {
      return `${totalMinutes}m left`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m left`;
  }

  function applyStatus(message, mode = "") {
    setStatus(message);
    setStatusMode(mode);
  }

  async function authHeaders() {
    if (!authRequired || typeof getToken !== "function") {
      return {};
    }

    const token = await getToken();
    if (!token) {
      return {};
    }

    return {
      Authorization: `Bearer ${token}`,
      "X-Auth-Display-Name": String(authUser?.name || "").slice(0, 32),
      "X-Auth-User-Id": String(authUser?.id || "")
    };
  }

  function clearPendingAttachments() {
    setPendingAttachments([]);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }

  function fileToAttachment(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          name: file.name,
          type: file.type || "application/octet-stream",
          dataUrl: String(reader.result || ""),
          size: file.size
        });
      };
      reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function handleAttachmentChange(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      setPendingAttachments([]);
      return;
    }

    const maxFiles = 5;
    const maxFileSize = 4 * 1024 * 1024;
    const selectedFiles = files.slice(0, maxFiles).filter((file) => file.size <= maxFileSize);

    if (selectedFiles.length !== files.length) {
      applyStatus("Attachments are limited to 5 files and 4 MB each.", "warn");
    }

    try {
      const encoded = await Promise.all(selectedFiles.map(fileToAttachment));
      setPendingAttachments(encoded);
    } catch (error) {
      applyStatus(error.message, "error");
      clearPendingAttachments();
    }
  }

  function playNotificationSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        return;
      }

      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.2);

      oscillator.onended = () => {
        ctx.close().catch(() => {});
      };
    } catch (error) {
      // Ignore sound failures to avoid interrupting chat flow.
    }
  }

  function shouldPlaySoundForMessage(message) {
    if (soundMode === "off") {
      return false;
    }
    if (soundMode === "mention") {
      return isMentionedMessage(message?.text, user);
    }
    return true;
  }

  function normalizeRoom(value) {
    const cleaned = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 24);
    return cleaned;
  }

  function randomRoomCode() {
    const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
    const timePart = Date.now().toString(36).slice(-4);

    try {
      const bytes = new Uint8Array(8);
      window.crypto.getRandomValues(bytes);
      let randomPart = "";
      for (const byte of bytes) {
        randomPart += alphabet[byte % alphabet.length];
      }
      return `${timePart}${randomPart}`;
    } catch (error) {
      const fallback = (Math.random().toString(36) + Math.random().toString(36)).replace(/[^a-z0-9]/g, "").slice(0, 8);
      return `${timePart}${fallback}`;
    }
  }

  async function startRoom(nextRoom, nextMode = "join", explicitName) {
    const cleanedName = String(explicitName ?? nameInput).trim().slice(0, 32);
    const cleanedRoom = normalizeRoom(nextRoom);

    if (!cleanedName) {
      applyStatus("Please enter your name.", "error");
      return;
    }

    if (!cleanedRoom) {
      applyStatus("Please enter a valid room code.", "error");
      return;
    }

    const nextRole = nextMode === "host" ? "host" : "member";

    setUser(cleanedName);
    setRoom(cleanedRoom);
    setMode(nextMode);
    setRole(nextRole);
    localStorage.setItem(USER_KEY, cleanedName);
    localStorage.setItem(ROOM_KEY, cleanedRoom);
    localStorage.setItem(MODE_KEY, nextMode);
    localStorage.setItem(ROLE_KEY, nextRole);

    if (nextMode === "host") {
      await bootstrapHostRoom(cleanedRoom, cleanedName);
    }

    setIsReady(true);
    applyStatus(`Connected as ${cleanedName} in room ${cleanedRoom}`);
  }

  async function fetchMessages() {
    if (isFetchingMessagesRef.current) {
      return;
    }

    isFetchingMessagesRef.current = true;
    try {
      const headers = await authHeaders();
      const response = await fetch(
        `/api/messages?room=${encodeURIComponent(room)}&user=${encodeURIComponent(user)}`,
        {
          cache: "no-store",
          headers
        }
      );

      if (!response.ok) {
        throw new Error(`Unable to load messages (${response.status})`);
      }

      const payload = await response.json();
      const nextMessages = payload.messages || [];

      if (payload.access && payload.access.banned) {
        leaveRoom(false, "You are banned from this room.");
        return;
      }
      if (payload.access && payload.access.kicked) {
        leaveRoom(false, "You were kicked from this room.");
        return;
      }

      setMessages(nextMessages);
      setOnlineUsers(payload.onlineUsers || []);
      setTypingUsers(payload.typingUsers || []);
      setModerationInfo(payload.moderation || {
        roles: {},
        muted: [],
        mutedUntil: {},
        banned: [],
        bannedUntil: {},
        kicked: [],
        log: []
      });
      if (room) {
        localStorage.setItem(roomCacheKey(room), JSON.stringify(nextMessages));
      }
      setStorage(payload.storage || "memory");
      if (payload.roomHost) {
        localStorage.setItem(ROLE_KEY, payload.roomHost === user ? "host" : String(payload.myRole || role));
      }

      if (payload.myRole) {
        setRole(String(payload.myRole));
      }

      if (payload.storage === "memory") {
        applyStatus("Connected in temporary memory mode. Add KV in Vercel for persistence.", "warn");
      } else if (payload.access && payload.access.muted) {
        applyStatus("You are muted in this room.", "warn");
      } else {
        applyStatus(`Connected as ${user} in room ${room}`);
      }
    } finally {
      isFetchingMessagesRef.current = false;
    }
  }

  async function postPresence(active) {
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ room, user, active })
      });
      if (response.status === 403) {
        leaveRoom(false, "You no longer have access to this room.");
        return;
      }
      if (response.ok) {
        const payload = await response.json().catch(() => ({}));
        if (Array.isArray(payload.onlineUsers)) {
          setOnlineUsers(payload.onlineUsers);
        }
      }
    } catch (error) {
      // Silent presence failures should not break chat.
    }
  }

  async function postTyping(active) {
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ room, user, active })
      });
      if (response.status === 403) {
        leaveRoom(false, "You no longer have access to this room.");
      }
    } catch (error) {
      // Silent typing failures should not break chat.
    }
  }

  async function moderateUser(action, targetOverride, options = {}) {
    closeContextMenu();
    const targetUser = String(targetOverride || selectedTarget || "").trim();
    if (!targetUser) {
      applyStatus("Select a participant first.", "warn");
      return;
    }

    const headers = await authHeaders();
    const response = await fetch("/api/moderation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify({
        room,
        actor: user,
        target: targetUser,
        action,
        targetRole: options.targetRole || "",
        durationMs: Number(options.durationMs || 0)
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Moderation failed (${response.status})`);
    }

    await fetchMessages();
    applyStatus(`${action} action applied to ${targetUser}.`);
  }

  async function moderateWithOptionalDuration(action, targetOverride) {
    if (action !== "mute" && action !== "ban") {
      await moderateUser(action, targetOverride);
      return;
    }

    const durationMs = parseDurationMs(action);
    if (durationMs === null) {
      return;
    }
    await moderateUser(action, targetOverride, { durationMs });
  }

  function selectReplyTarget(message) {
    setReplyTo({
      id: message.id,
      user: message.user,
      text: String(message.text || "").slice(0, 160)
    });
    setContextMenu({ visible: false, x: 0, y: 0, message: null });
  }

  function openContextMenu(event, message) {
    event.preventDefault();
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      message
    });
  }

  function closeContextMenu() {
    setContextMenu({ visible: false, x: 0, y: 0, message: null });
  }

  useEffect(() => {
    if (authRequired && authUser?.name) {
      const trustedName = String(authUser.name).trim().slice(0, 32);
      if (trustedName && trustedName !== user) {
        setUser(trustedName);
        setNameInput(trustedName);
      }
    }
  }, [authRequired, authUser, user]);

  useEffect(() => {
    if (!isReady || !room || !user) {
      return;
    }

    const cached = localStorage.getItem(roomCacheKey(room));
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        }
      } catch (error) {
        // Ignore malformed cache and continue with server fetch.
      }
    }

    let active = true;

    async function refresh() {
      try {
        await fetchMessages();
      } catch (error) {
        if (active) {
          applyStatus(error.message, "error");
        }
      }
    }

    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    postPresence(true);
    const presenceBeat = window.setInterval(() => {
      postPresence(true);
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.clearInterval(presenceBeat);
      postPresence(false);
    };
  }, [user, room, isReady]);

  useEffect(() => {
    const node = messagesRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const latestMessage = messages.length ? messages[messages.length - 1] : null;
    const latestId = latestMessage ? String(latestMessage.id || "") : "";

    if (!hasLoadedMessagesRef.current) {
      hasLoadedMessagesRef.current = true;
      lastMessageIdRef.current = latestId;
      return;
    }

    if (latestId && latestId !== lastMessageIdRef.current && shouldPlaySoundForMessage(latestMessage)) {
      playNotificationSound();
      lastMessageIdRef.current = latestId;
      return;
    }

    lastMessageIdRef.current = latestId;
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(SOUND_MODE_KEY, soundMode);
  }, [soundMode]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(LEFT_PANEL_WIDTH_KEY, String(Math.round(leftPanelWidth)));
  }, [leftPanelWidth]);

  useEffect(() => {
    if (!activeResizer) {
      return;
    }

    function onPointerMove(event) {
      if (!chatLayoutRef.current) {
        return;
      }

      const bounds = chatLayoutRef.current.getBoundingClientRect();
      const minSide = 220;
      const minCenter = 360;

      if (activeResizer === "left") {
        const maxLeft = Math.max(minSide, bounds.width - minCenter - 16);
        const proposed = event.clientX - bounds.left;
        const clamped = Math.max(minSide, Math.min(maxLeft, proposed));
        setLeftPanelWidth(clamped);
      }
    }

    function stopResizing() {
      setActiveResizer("");
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResizing);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResizing);
    };
  }, [activeResizer, leftPanelWidth]);

  useEffect(() => {
    function onPointerDown() {
      if (contextMenu.visible) {
        closeContextMenu();
      }
    }

    function onEscape(event) {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [contextMenu.visible]);

  useEffect(() => {
    function clearInactivityTimer() {
      if (inactivityTimerRef.current) {
        window.clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    }

    function scheduleInactivityLeave() {
      if (!isReady) {
        return;
      }

      clearInactivityTimer();
      applyStatus("Tab inactive. Room session will close in 3 minutes if you do not return.", "warn");

      inactivityTimerRef.current = window.setTimeout(() => {
        leaveRoom(true, "Room session closed after 3 minutes of tab inactivity.");
      }, TAB_INACTIVE_MS);
    }

    function handleVisibilityChange() {
      if (!isReady) {
        clearInactivityTimer();
        return;
      }

      if (document.hidden) {
        scheduleInactivityLeave();
      } else {
        clearInactivityTimer();
        applyStatus(`Connected as ${user} in room ${room}`);
      }
    }

    function handleWindowFocus() {
      if (!isReady) {
        return;
      }
      clearInactivityTimer();
      applyStatus(`Connected as ${user} in room ${room}`);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      clearInactivityTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [isReady, room, user]);

  async function onSubmit(event) {
    event.preventDefault();

    const nextText = text.trim();
    if (!nextText && !pendingAttachments.length) {
      return;
    }

    setText("");
    postTyping(false);

    let payload = {
      user,
      room,
      role,
      text: nextText,
      replyTo
    };

    if (nextText.toLowerCase().startsWith("/dm ")) {
      const parts = nextText.split(" ");
      const target = (parts[1] || "").trim();
      const dmBody = parts.slice(2).join(" ").trim();
      if (!target || !dmBody) {
        applyStatus("Usage: /dm username your message", "warn");
        return;
      }
      payload = {
        ...payload,
        to: target,
        text: dmBody
      };
    }

    try {
      const headers = await authHeaders();
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          ...payload,
          attachments: pendingAttachments
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Send failed (${response.status})`);
      }

      await fetchMessages();
      setReplyTo(null);
      clearPendingAttachments();
    } catch (error) {
      applyStatus(error.message, "error");
    }
  }

  async function performMessageAction(action, message, extra = {}) {
    try {
      let textValue = "";
      if (action === "edit") {
        const editedText = window.prompt("Edit message", message.text || "");
        if (editedText === null) {
          return;
        }
        textValue = editedText;
      }

      const headers = await authHeaders();
      const response = await fetch("/api/message-action", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          room,
          actor: user,
          action,
          messageId: message.id,
          text: textValue,
          ...extra
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Action failed (${response.status})`);
      }

      await fetchMessages();
    } catch (error) {
      applyStatus(error.message, "error");
    }
  }

  async function bootstrapHostRoom(roomCode, displayName) {
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ room: roomCode, user: displayName })
      });

      if (!response.ok) {
        return;
      }

      const payload = await response.json().catch(() => ({}));
      if (payload.roomHost === displayName) {
        setRole("host");
        localStorage.setItem(ROLE_KEY, "host");
      }
      if (Array.isArray(payload.onlineUsers)) {
        setOnlineUsers(payload.onlineUsers);
      }
    } catch (error) {
      // Host bootstrap is best-effort so the room still opens.
    }
  }

  async function handleHostRoom() {
    const nextRoom = randomRoomCode();
    await startRoom(nextRoom, "host");
  }

  async function handleJoinRoom() {
    await startRoom(roomInput, "join");
  }

  async function handleRejoinLastRoom() {
    if (!savedUser || !savedRoom) {
      return;
    }
    await startRoom(savedRoom, savedMode, savedUser);
  }

  async function copyRoomCode() {
    if (!room) {
      return;
    }

    try {
      await navigator.clipboard.writeText(room);
      applyStatus("Room code copied.");
    } catch (error) {
      applyStatus("Unable to copy room code. Copy it manually.", "warn");
    }
  }

  function leaveRoom(fromLifecycle = false, customMessage) {
    if (inactivityTimerRef.current) {
      window.clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }

    localStorage.removeItem(ROOM_KEY);
    localStorage.removeItem(ROLE_KEY);
    setIsReady(false);
    setRoom("");
    setRole("member");
    setRoomInput("");
    setSelectedTarget("");
    setReplyTo(null);
    closeContextMenu();
    setMessages([]);
    clearPendingAttachments();
    if (fromLifecycle) {
      applyStatus(customMessage || "Room session closed after inactivity.", "warn");
      return;
    }
    if (customMessage) {
      applyStatus(customMessage, "warn");
      return;
    }
    applyStatus("Choose another room.");
  }

  return (
    <>
      <div className="orb orb-a" />
      <div className="orb orb-b" />

      <main className="shell">
        <button type="button" className="theme-toggle" onClick={toggleTheme}>
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>
        {!isReady ? (
          <section className="entry-panel">
            <h1>ChatApp</h1>
            <p className="entry-subtitle">Enter your name, then choose to host a new room or join one.</p>

            <label className="entry-label" htmlFor="nameInput">Name</label>
            <input
              id="nameInput"
              className="entry-input"
              type="text"
              maxLength={32}
              placeholder="Your name"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              disabled={authRequired}
            />

            <div className="entry-actions">
              <button className="entry-primary" type="button" onClick={handleHostRoom}>Host Room</button>
            </div>

            <div className="join-box">
              <label className="entry-label" htmlFor="roomInput">Room Code</label>
              <input
                id="roomInput"
                className="entry-input"
                type="text"
                maxLength={24}
                placeholder="ex: a1b2c3"
                value={roomInput}
                onChange={(event) => setRoomInput(event.target.value)}
              />
              <button className="ghost-btn" type="button" onClick={handleJoinRoom}>Join Room</button>
            </div>

            {savedUser && savedRoom ? (
              <div className="rejoin-box">
                <p className="rejoin-text">
                  Last session: <strong>{savedUser}</strong> in room <strong>{savedRoom}</strong>
                </p>
                <div className="rejoin-actions">
                  <button className="entry-primary" type="button" onClick={handleRejoinLastRoom}>Rejoin Last Room</button>
                </div>
              </div>
            ) : null}

            <p className={`status ${statusMode}`.trim()}>{status}</p>
          </section>
        ) : (
          <>
            <header className="topbar">
              <div>
                <h1>ChatApp</h1>
                <p>
                  Room: {room} • {participantCount} participant{participantCount === 1 ? "" : "s"} • You are
                  <span className={`role-badge ${role}`}>{role}</span>
                </p>
              </div>
              <div className="topbar-actions">
                {mode === "host" ? (
                  <button className="ghost-btn" type="button" onClick={copyRoomCode}>Copy Room Code</button>
                ) : null}
                <button className="ghost-btn" type="button" onClick={leaveRoom}>Leave Room</button>
              </div>
            </header>

            <section className="chat-panel">
              <div className="presence-strip">
                <span className="presence-label">Online:</span>
                <span className="presence-users">{onlineUsers.length ? onlineUsers.join(", ") : "No active users"}</span>
                {typingUsers.length ? <span className="typing-indicator">• {typingUsers.join(", ")} typing...</span> : null}
              </div>
              <div
                className="chat-layout"
                ref={chatLayoutRef}
                style={{
                  "--left-panel-width": `${leftPanelWidth}px`
                }}
              >
                <aside className="chat-side chat-side-left">
                  <section className="members-sidebar" aria-label="Members and controls">
                    <div className="members-sidebar-head">
                      <strong>Members</strong>
                      <span>{memberDirectory.length}</span>
                    </div>

                    <div className="history-search">
                      <label className="entry-label" htmlFor="historySearch">Search history</label>
                      <input
                        id="historySearch"
                        className="entry-input"
                        type="search"
                        placeholder="Search user, text, date"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                      />
                      <div className="history-search-meta">
                        <span>{filteredMessages.length} result{filteredMessages.length === 1 ? "" : "s"}</span>
                        <button type="button" className="ghost-btn" onClick={() => setSearchQuery("")} disabled={!searchQuery}>Clear</button>
                      </div>
                    </div>

                    <div className="members-sidebar-list">
                      {memberDirectory.map((member) => {
                        const normalizedMember = String(member).toLowerCase();
                        const isSelf = normalizedMember === String(user).toLowerCase();
                        const currentMemberRole = memberRole(member);
                        const isMuted = (moderationInfo.muted || []).includes(normalizedMember);
                        const isBanned = (moderationInfo.banned || []).includes(normalizedMember);
                        const isKicked = (moderationInfo.kicked || []).includes(normalizedMember);
                        const canModerateTarget = !isSelf && roleCanModerate(role) && (role === "host" || currentMemberRole === "member");

                        return (
                          <article className="member-item" key={member}>
                            <div className="member-item-row">
                              <span className="member-name">{member}</span>
                              <span className={`role-badge ${currentMemberRole}`}>{currentMemberRole}</span>
                            </div>
                            <div className="member-flags">
                              {isMuted ? <span className="member-flag">Muted {formatRemaining(moderationInfo.mutedUntil?.[normalizedMember])}</span> : null}
                              {isKicked ? <span className="member-flag">Kicked</span> : null}
                              {isBanned ? <span className="member-flag">Banned {formatRemaining(moderationInfo.bannedUntil?.[normalizedMember])}</span> : null}
                            </div>
                            {canModerateTarget ? (
                              <div className="member-inline-actions">
                                <button type="button" className="ghost-btn" onClick={() => moderateWithOptionalDuration("mute", member)}>Mute</button>
                                <button type="button" className="ghost-btn" onClick={() => moderateUser("unmute", member)}>Unmute</button>
                                <button type="button" className="ghost-btn" onClick={() => moderateUser("kick", member)}>Kick</button>
                                <button type="button" className="ghost-btn" onClick={() => moderateUser("unkick", member)}>Unkick</button>
                                {roleCanBan(role) ? <button type="button" className="ghost-btn" onClick={() => moderateWithOptionalDuration("ban", member)}>Ban</button> : null}
                                {roleCanBan(role) ? <button type="button" className="ghost-btn" onClick={() => moderateUser("unban", member)}>Unban</button> : null}
                              </div>
                            ) : null}
                            {!isSelf && roleCanManageRoles(role) ? (
                              <div className="member-role-actions">
                                <button type="button" className="ghost-btn" onClick={() => moderateUser("setrole", member, { targetRole: "moderator" })}>Make Moderator</button>
                                <button type="button" className="ghost-btn" onClick={() => moderateUser("setrole", member, { targetRole: "cohost" })}>Make Co-host</button>
                                <button type="button" className="ghost-btn" onClick={() => moderateUser("clearrole", member)}>Set Member</button>
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>

                    {roleCanModerate(role) ? (
                      <div className="member-controls-inline">
                        <h3>Quick Controls</h3>
                        <div className="moderation-bar">
                          <select
                            className="moderation-select"
                            value={selectedTarget}
                            onChange={(event) => setSelectedTarget(event.target.value)}
                          >
                            <option value="">Select user...</option>
                            {participantList
                              .filter((participant) => participant.toLowerCase() !== String(user).toLowerCase())
                              .map((participant) => (
                                <option key={participant} value={participant}>{participant}</option>
                              ))}
                          </select>
                          <button type="button" className="ghost-btn" onClick={() => moderateWithOptionalDuration("mute")}>Mute</button>
                          <button type="button" className="ghost-btn" onClick={() => moderateUser("unmute")}>Unmute</button>
                          <button type="button" className="ghost-btn" onClick={() => moderateUser("kick")}>Kick</button>
                          <button type="button" className="ghost-btn" onClick={() => moderateUser("unkick")}>Unkick</button>
                          {roleCanBan(role) ? <button type="button" className="ghost-btn" onClick={() => moderateWithOptionalDuration("ban")}>Ban</button> : null}
                          {roleCanBan(role) ? <button type="button" className="ghost-btn" onClick={() => moderateUser("unban")}>Unban</button> : null}
                        </div>
                        {roleCanManageRoles(role) ? (
                          <div className="member-role-actions member-role-actions-compact">
                            <button type="button" className="ghost-btn" onClick={() => moderateUser("setrole", selectedTarget, { targetRole: "moderator" })}>Make Moderator</button>
                            <button type="button" className="ghost-btn" onClick={() => moderateUser("setrole", selectedTarget, { targetRole: "cohost" })}>Make Co-host</button>
                            <button type="button" className="ghost-btn" onClick={() => moderateUser("clearrole", selectedTarget)}>Set Member</button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {(roleCanModerate(role)) && (moderationInfo.muted?.length || moderationInfo.kicked?.length || moderationInfo.banned?.length) ? (
                      <div className="moderation-lists">
                        <span>Muted: {moderationInfo.muted?.join(", ") || "none"}</span>
                        <span>Kicked: {moderationInfo.kicked?.join(", ") || "none"}</span>
                        <span>Banned: {moderationInfo.banned?.join(", ") || "none"}</span>
                      </div>
                    ) : null}

                    {roleCanModerate(role) && moderationInfo.log?.length ? (
                      <details className="moderation-log">
                        <summary>Moderation Log</summary>
                        <ul>
                          {moderationInfo.log.slice(-8).reverse().map((entry) => (
                            <li key={entry.id}>{entry.actor} {entry.action} {entry.target} ({formatTime(entry.ts)})</li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </section>
                </aside>

                <div
                  className={`pane-resizer ${activeResizer === "left" ? "active" : ""}`.trim()}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize members panel"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    setActiveResizer("left");
                  }}
                />

                <section className="chat-main">
                  <div ref={messagesRef} className="messages" aria-live="polite" aria-label="Chat messages">
                    {filteredMessages.length ? filteredMessages.map((message, index) => {
                      const isMine = String(message.user || "").toLowerCase() === String(user || "").toLowerCase();
                      const isMentioned = isMentionedMessage(message.text, user) && !isMine;
                      const bubbleClass = `bubble ${isMine ? "mine" : "other"} ${isMentioned ? "mention" : ""} ${message.type === "dm" ? "dm" : ""}`.trim();
                      const canEdit = isMine && !message.deleted;
                      const canDelete = (isMine || role === "host") && !message.deleted;
                      const senderRole = memberRole(message.user);

                      return (
                        <article
                          className={bubbleClass}
                          key={message.id}
                          onContextMenu={(event) => openContextMenu(event, message)}
                          style={{ animationDelay: `${Math.min(index * 24, 280)}ms` }}
                        >
                          <div className="meta">
                            <strong className="user">{message.user}</strong>
                            {message.type === "dm" ? <span className="dm-pill">DM {message.to ? `to ${message.to}` : ""}</span> : null}
                            <span className={`role-badge ${senderRole}`}>{senderRole}</span>
                            <span className="time">{formatTime(message.ts)}</span>
                            {message.editedAt ? <span className="edited-pill">edited</span> : null}
                          </div>
                          {message.replyTo ? (
                            <div className="reply-preview">
                              <strong>{message.replyTo.user || "Unknown"}</strong>
                              <span>{message.replyTo.text || ""}</span>
                            </div>
                          ) : null}
                          {Array.isArray(message.attachments) && message.attachments.length && !message.deleted ? (
                            <div className="attachment-list">
                              {message.attachments.map((attachment) => {
                                const kind = attachmentKind(attachment);
                                if (kind === "image") {
                                  return <img className="attachment-media" key={attachment.name + attachment.dataUrl} src={attachment.dataUrl} alt={attachment.name} />;
                                }
                                if (kind === "video") {
                                  return <video className="attachment-media" key={attachment.name + attachment.dataUrl} controls src={attachment.dataUrl} />;
                                }
                                if (kind === "audio") {
                                  return <audio className="attachment-media" key={attachment.name + attachment.dataUrl} controls src={attachment.dataUrl} />;
                                }
                                return (
                                  <a className="attachment-file" key={attachment.name + attachment.dataUrl} href={attachment.dataUrl} download={attachment.name} target="_blank" rel="noreferrer">
                                    {attachment.name}
                                  </a>
                                );
                              })}
                            </div>
                          ) : null}
                          <p className="text">{message.text}</p>
                          {(canEdit || canDelete) ? (
                            <div className="message-actions">
                              {canEdit ? <button type="button" onClick={() => performMessageAction("edit", message)}>Edit</button> : null}
                              {canDelete ? <button type="button" onClick={() => performMessageAction("delete", message)}>Delete</button> : null}
                            </div>
                          ) : null}
                        </article>
                      );
                    }) : (
                      <div className="search-empty-state">
                        <strong>No messages match your search.</strong>
                        <span>Try a user name, a word from the message, or part of the date/time.</span>
                      </div>
                    )}
                  </div>

                  <form className="composer" onSubmit={onSubmit}>
                    {replyTo ? (
                      <div className="replying-strip">
                        <span>Replying to {replyTo.user}: {replyTo.text}</span>
                        <button type="button" onClick={() => setReplyTo(null)}>Cancel</button>
                      </div>
                    ) : null}
                    <div className="composer-attachments">
                      <label className="attachment-button">
                        Attach files
                        <input
                          ref={attachmentInputRef}
                          type="file"
                          multiple
                          onChange={handleAttachmentChange}
                        />
                      </label>
                      {pendingAttachments.length ? <span>{pendingAttachments.length} file{pendingAttachments.length === 1 ? "" : "s"} ready</span> : null}
                    </div>
                    <input
                      type="text"
                      maxLength={500}
                      placeholder={status.includes("muted") ? "You are muted" : "Write a message..."}
                      autoComplete="off"
                      value={text}
                      onChange={(event) => {
                        setText(event.target.value);
                        postTyping(true);
                        if (typingOffTimerRef.current) {
                          window.clearTimeout(typingOffTimerRef.current);
                        }
                        typingOffTimerRef.current = window.setTimeout(() => {
                          postTyping(false);
                        }, 1200);
                      }}
                      disabled={status.includes("muted")}
                      required={!pendingAttachments.length}
                    />
                    <button type="submit" disabled={status.includes("muted")}>Send</button>
                  </form>

                  <p className={`status ${statusMode}`.trim()}>
                    {status} {storage === "kv" ? "(persistent storage)" : "(temporary memory mode)"}
                  </p>
                </section>
              </div>
            </section>
          </>
        )}
      </main>

      {isReady && contextMenu.visible && contextMenu.message ? (
        <menu
          className="message-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            onClick={() => selectReplyTarget(contextMenu.message)}
          >
            Reply
          </button>
          {String(contextMenu.message.user || "").toLowerCase() === String(user || "").toLowerCase() && !contextMenu.message.deleted ? (
            <button type="button" onClick={() => {
              performMessageAction("edit", contextMenu.message);
              closeContextMenu();
            }}>
              Edit Message
            </button>
          ) : null}
          {(String(contextMenu.message.user || "").toLowerCase() === String(user || "").toLowerCase() || role === "host") && !contextMenu.message.deleted ? (
            <button type="button" onClick={() => {
              performMessageAction("delete", contextMenu.message);
              closeContextMenu();
            }}>
              Delete Message
            </button>
          ) : null}
          {roleCanModerate(role) && String(contextMenu.message.user || "").toLowerCase() !== String(user || "").toLowerCase() ? (
            <>
              <button type="button" onClick={() => moderateWithOptionalDuration("mute", contextMenu.message.user)}>Mute User</button>
              <button type="button" onClick={() => moderateUser("unmute", contextMenu.message.user)}>Unmute User</button>
              <button type="button" onClick={() => moderateUser("kick", contextMenu.message.user)}>Kick User</button>
              <button type="button" onClick={() => moderateUser("unkick", contextMenu.message.user)}>Unkick User</button>
              {roleCanBan(role) ? <button type="button" onClick={() => moderateWithOptionalDuration("ban", contextMenu.message.user)}>Ban User</button> : null}
              {roleCanBan(role) ? <button type="button" onClick={() => moderateUser("unban", contextMenu.message.user)}>Unban User</button> : null}
              {roleCanManageRoles(role) ? <button type="button" onClick={() => moderateUser("setrole", contextMenu.message.user, { targetRole: "moderator" })}>Make Moderator</button> : null}
              {roleCanManageRoles(role) ? <button type="button" onClick={() => moderateUser("setrole", contextMenu.message.user, { targetRole: "cohost" })}>Make Co-host</button> : null}
              {roleCanManageRoles(role) ? <button type="button" onClick={() => moderateUser("clearrole", contextMenu.message.user)}>Set Member</button> : null}
            </>
          ) : null}
        </menu>
      ) : null}
    </>
  );
}