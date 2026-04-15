const MEMORY_LIMIT = 100;

let kvClient = null;
try {
  ({ kv: kvClient } = require("@vercel/kv"));
} catch (error) {
  kvClient = null;
}

if (!globalThis.__CHATAPP_MEM__) {
  globalThis.__CHATAPP_MEM__ = [];
}

const memoryStore = globalThis.__CHATAPP_MEM__;

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

async function listMessages(room) {
  const normalizedRoom = normalizeRoom(room);

  if (hasKvConfig()) {
    const allMessages = normalizeMessages(await readFromKv());
    return {
      storage: "kv",
      messages: normalizedRoom ? allMessages.filter((message) => normalizeRoom(message.room) === normalizedRoom) : allMessages
    };
  }

  const allMessages = normalizeMessages(readFromMemory());
  return {
    storage: "memory",
    messages: normalizedRoom ? allMessages.filter((message) => normalizeRoom(message.room) === normalizedRoom) : allMessages
  };
}

async function appendMessage(message) {
  const next = {
    id: message.id,
    user: message.user,
    room: normalizeRoom(message.room),
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

module.exports = {
  listMessages,
  appendMessage
};
