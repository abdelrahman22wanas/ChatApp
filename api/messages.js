const { listMessages, appendMessage } = require("./_store");
const { requireAuth } = require("./_auth");

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
    const auth = await requireAuth(req);
    if (!auth.ok) {
      return json(res, auth.status || 401, { error: auth.error || "Unauthorized" });
    }

    if (req.method === "GET") {
      const room = readRoomFromReq(req);
      const authDisplayName = safeText(req.headers["x-auth-display-name"], 32);
      const user = auth.authEnabled ? authDisplayName || `user-${String(auth.userId).slice(-6)}` : readUserFromReq(req);
      const result = await listMessages(room, user);
      return json(res, 200, result);
    }

    if (req.method === "POST") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

      const authDisplayName = safeText(req.headers["x-auth-display-name"], 32);
      const user = auth.authEnabled ? authDisplayName || `user-${String(auth.userId).slice(-6)}` : safeText(payload.user, 32);
      const room = safeText(payload.room, 24).toLowerCase();
      const to = safeText(payload.to, 32);
      const text = safeText(payload.text, 500);
      const attachments = Array.isArray(payload.attachments)
        ? payload.attachments.slice(0, 5).map((attachment) => ({
            name: safeText(attachment && attachment.name, 128),
            type: safeText(attachment && attachment.type, 96),
            dataUrl: safeText(attachment && attachment.dataUrl, 5_000_000),
            size: Math.max(0, Number(attachment && attachment.size || 0))
          })).filter((attachment) => attachment.name && attachment.dataUrl)
        : [];
      const replyTo = payload.replyTo && typeof payload.replyTo === "object"
        ? {
            id: safeText(payload.replyTo.id, 64),
            user: safeText(payload.replyTo.user, 32),
            text: safeText(payload.replyTo.text, 160)
          }
        : null;

      if (!user || !room || (!text && attachments.length === 0)) {
        return json(res, 400, {
          error: "User, room, and a message or attachment are required."
        });
      }

      const result = await appendMessage({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        user,
        to,
        room,
        replyTo,
        authUserId: auth.userId || "",
        text,
        attachments,
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
