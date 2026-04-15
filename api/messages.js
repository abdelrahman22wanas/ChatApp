const { listMessages, appendMessage } = require("./_store");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function safeText(value, max) {
  return String(value || "").trim().slice(0, max);
}

function normalizeRole(value) {
  const role = safeText(value, 16).toLowerCase();
  if (role === "host") {
    return "host";
  }
  return "member";
}

function readRoomFromReq(req) {
  if (req.query && typeof req.query.room === "string") {
    return safeText(req.query.room, 24).toLowerCase();
  }

  try {
    const fullUrl = new URL(req.url, "http://localhost");
    return safeText(fullUrl.searchParams.get("room"), 24).toLowerCase();
  } catch (error) {
    return "";
  }
}

function readUserFromReq(req) {
  if (req.query && typeof req.query.user === "string") {
    return safeText(req.query.user, 32);
  }

  try {
    const fullUrl = new URL(req.url, "http://localhost");
    return safeText(fullUrl.searchParams.get("user"), 32);
  } catch (error) {
    return "";
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      const room = readRoomFromReq(req);
      const user = readUserFromReq(req);
      const result = await listMessages(room, user);
      return json(res, 200, result);
    }

    if (req.method === "POST") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

      const user = safeText(payload.user, 32);
      const room = safeText(payload.room, 24).toLowerCase();
      const role = normalizeRole(payload.role);
      const to = safeText(payload.to, 32);
      const text = safeText(payload.text, 500);

      if (!user || !room || !text) {
        return json(res, 400, {
          error: "User, room, and text are required."
        });
      }

      const result = await appendMessage({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        user,
        to,
        room,
        role,
        text,
        ts: new Date().toISOString()
      });

      if (result && result.denied) {
        return json(res, 403, {
          error: `Message blocked: ${result.denied}`
        });
      }

      return json(res, 201, result);
    }

    return json(res, 405, { error: "Method not allowed." });
  } catch (error) {
    return json(res, 500, {
      error: error && error.message ? error.message : "Unexpected server error."
    });
  }
};
