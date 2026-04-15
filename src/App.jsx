import { useEffect, useMemo, useRef, useState } from "react";

const POLL_MS = 2000;
const USER_KEY = "chatapp.web.user";
const ROOM_KEY = "chatapp.web.room";
const MODE_KEY = "chatapp.web.mode";

function roomCacheKey(room) {
  return `chatapp.web.room.messages.${room}`;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function App() {
  const savedUser = localStorage.getItem(USER_KEY) || "";
  const savedRoom = localStorage.getItem(ROOM_KEY) || "";
  const savedMode = localStorage.getItem(MODE_KEY) || "join";

  const [user, setUser] = useState(() => localStorage.getItem(USER_KEY) || "");
  const [nameInput, setNameInput] = useState(() => localStorage.getItem(USER_KEY) || "");
  const [roomInput, setRoomInput] = useState("");
  const [room, setRoom] = useState(() => localStorage.getItem(ROOM_KEY) || "");
  const [mode, setMode] = useState(() => localStorage.getItem(MODE_KEY) || "join");
  const [isReady, setIsReady] = useState(false);
  const [autoRejoinSeconds, setAutoRejoinSeconds] = useState(() => (savedUser && savedRoom ? 3 : 0));
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("Set your name and start or join a room.");
  const [statusMode, setStatusMode] = useState("");
  const [storage, setStorage] = useState("memory");
  const messagesRef = useRef(null);

  const participantCount = useMemo(() => {
    const participants = new Set();
    for (const message of messages) {
      if (message.user) {
        participants.add(String(message.user).toLowerCase());
      }
    }
    if (user) {
      participants.add(user.toLowerCase());
    }
    return participants.size;
  }, [messages, user]);

  function applyStatus(message, mode = "") {
    setStatus(message);
    setStatusMode(mode);
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
    return Math.random().toString(36).slice(2, 8);
  }

  function startRoom(nextRoom, nextMode = "join", explicitName) {
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

    setUser(cleanedName);
    setRoom(cleanedRoom);
    setMode(nextMode);
    setIsReady(true);
    setAutoRejoinSeconds(0);
    localStorage.setItem(USER_KEY, cleanedName);
    localStorage.setItem(ROOM_KEY, cleanedRoom);
    localStorage.setItem(MODE_KEY, nextMode);
    applyStatus(`Connected as ${cleanedName} in room ${cleanedRoom}`);
  }

  async function fetchMessages() {
    const response = await fetch(`/api/messages?room=${encodeURIComponent(room)}`, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Unable to load messages (${response.status})`);
    }

    const payload = await response.json();
    const nextMessages = payload.messages || [];
    setMessages(nextMessages);
    if (room) {
      localStorage.setItem(roomCacheKey(room), JSON.stringify(nextMessages));
    }
    setStorage(payload.storage || "memory");

    if (payload.storage === "memory") {
      applyStatus("Connected in temporary memory mode. Add KV in Vercel for persistence.", "warn");
    } else {
      applyStatus(`Connected as ${user} in room ${room}`);
    }
  }

  async function sendMessage(nextText) {
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ user, room, text: nextText })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Send failed (${response.status})`);
    }
  }

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

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [user, room, isReady]);

  useEffect(() => {
    const node = messagesRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isReady || !savedUser || !savedRoom || autoRejoinSeconds <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (autoRejoinSeconds === 1) {
        startRoom(savedRoom, savedMode, savedUser);
      } else {
        setAutoRejoinSeconds((current) => current - 1);
      }
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [autoRejoinSeconds, isReady, savedMode, savedRoom, savedUser]);

  useEffect(() => {
    function handlePageHide() {
      if (isReady) {
        leaveRoom(true);
      }
    }

    function handleVisibilityChange() {
      if (document.hidden && isReady) {
        leaveRoom(true);
      }
    }

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isReady]);

  async function onSubmit(event) {
    event.preventDefault();

    const nextText = text.trim();
    if (!nextText) {
      return;
    }

    setText("");

    try {
      await sendMessage(nextText);
      await fetchMessages();
    } catch (error) {
      applyStatus(error.message, "error");
    }
  }

  function handleHostRoom() {
    startRoom(randomRoomCode(), "host");
  }

  function handleJoinRoom() {
    startRoom(roomInput, "join");
  }

  function handleRejoinLastRoom() {
    if (!savedUser || !savedRoom) {
      return;
    }
    startRoom(savedRoom, savedMode, savedUser);
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

  function leaveRoom(fromLifecycle = false) {
    localStorage.removeItem(ROOM_KEY);
    setIsReady(false);
    setRoom("");
    setRoomInput("");
    setMessages([]);
    setAutoRejoinSeconds(0);
    if (fromLifecycle) {
      applyStatus("You left the room because the tab was hidden or closed.", "warn");
      return;
    }
    applyStatus("Choose another room.");
  }

  return (
    <>
      <div className="orb orb-a" />
      <div className="orb orb-b" />

      <main className="shell">
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
                  {autoRejoinSeconds > 0 ? (
                    <button className="ghost-btn" type="button" onClick={() => setAutoRejoinSeconds(0)}>
                      Cancel Auto Rejoin ({autoRejoinSeconds})
                    </button>
                  ) : null}
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
                <p>Room: {room} • {participantCount} participant{participantCount === 1 ? "" : "s"}</p>
              </div>
              <div className="topbar-actions">
                {mode === "host" ? (
                  <button className="ghost-btn" type="button" onClick={copyRoomCode}>Copy Room Code</button>
                ) : null}
                <button className="ghost-btn" type="button" onClick={leaveRoom}>Leave Room</button>
              </div>
            </header>

            <section className="chat-panel">
              <div ref={messagesRef} className="messages" aria-live="polite" aria-label="Chat messages">
                {messages.map((message) => (
                  <article className="bubble" key={message.id}>
                    <div className="meta">
                      <strong className="user">{message.user}</strong>
                      <span className="time">{formatTime(message.ts)}</span>
                    </div>
                    <p className="text">{message.text}</p>
                  </article>
                ))}
              </div>

              <form className="composer" onSubmit={onSubmit}>
                <input
                  type="text"
                  maxLength={500}
                  placeholder="Write a message..."
                  autoComplete="off"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  required
                />
                <button type="submit">Send</button>
              </form>

              <p className={`status ${statusMode}`.trim()}>
                {status} {storage === "kv" ? "(persistent storage)" : "(temporary memory mode)"}
              </p>
            </section>
          </>
        )}
      </main>
    </>
  );
}