import { useEffect, useRef, useState } from "react";

const POLL_MS = 2000;
const USER_KEY = "chatapp.web.user";

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function App() {
  const [user, setUser] = useState(() => localStorage.getItem(USER_KEY) || "Guest");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("Connecting...");
  const [statusMode, setStatusMode] = useState("");
  const [storage, setStorage] = useState("memory");
  const messagesRef = useRef(null);

  function applyStatus(message, mode = "") {
    setStatus(message);
    setStatusMode(mode);
  }

  function askForName() {
    const value = window.prompt("Choose your display name", user);
    if (!value) {
      return;
    }

    const cleaned = value.trim().slice(0, 32);
    if (!cleaned) {
      return;
    }

    setUser(cleaned);
    localStorage.setItem(USER_KEY, cleaned);
    applyStatus(`You are signed in as ${cleaned}`);
  }

  async function fetchMessages() {
    const response = await fetch("/api/messages", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Unable to load messages (${response.status})`);
    }

    const payload = await response.json();
    setMessages(payload.messages || []);
    setStorage(payload.storage || "memory");

    if (payload.storage === "memory") {
      applyStatus("Connected in temporary memory mode. Add KV in Vercel for persistence.", "warn");
    } else {
      applyStatus(`Connected as ${user}`);
    }
  }

  async function sendMessage(nextText) {
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ user, text: nextText })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Send failed (${response.status})`);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem(USER_KEY)) {
      askForName();
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
  }, [user]);

  useEffect(() => {
    const node = messagesRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages]);

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

  return (
    <>
      <div className="orb orb-a" />
      <div className="orb orb-b" />

      <main className="shell">
        <header className="topbar">
          <div>
            <h1>ChatApp</h1>
            <p>React front end on Vercel</p>
          </div>
          <button className="ghost-btn" type="button" onClick={askForName}>
            Change Name
          </button>
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
      </main>
    </>
  );
}