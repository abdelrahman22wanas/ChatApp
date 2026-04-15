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

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      const room = readRoomFromReq(req);
      const result = await listMessages(room);
      return json(res, 200, result);
    }

    if (req.method === "POST") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

      const user = safeText(payload.user, 32);
      const room = safeText(payload.room, 24).toLowerCase();
      const text = safeText(payload.text, 500);

      if (!user || !room || !text) {
        return json(res, 400, {
          error: "User, room, and text are required."
        });
      }

      const result = await appendMessage({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        user,
        room,
        text,
        ts: new Date().toISOString()
      });

      return json(res, 201, result);
    }

    return json(res, 405, { error: "Method not allowed." });
  } catch (error) {
    return json(res, 500, {
      error: error && error.message ? error.message : "Unexpected server error."
    });
  }
};
