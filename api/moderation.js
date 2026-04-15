const { moderateRoom } = require("./_store");
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

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." });
  }

  try {
    const auth = await requireAuth(req);
    if (!auth.ok) {
      return json(res, auth.status || 401, { error: auth.error || "Unauthorized" });
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const actor = auth.authEnabled
      ? safeText(req.headers["x-auth-display-name"], 32) || `user-${String(auth.userId).slice(-6)}`
      : safeText(payload.actor, 32);

    const result = await moderateRoom({
      room: safeText(payload.room, 24),
      actor,
      target: safeText(payload.target, 32),
      action: safeText(payload.action, 16),
      targetRole: safeText(payload.targetRole, 16),
      durationMs: Number(payload.durationMs || 0)
    });

    if (!result.ok) {
      return json(res, result.code || 400, { error: result.error || "Moderation failed." });
    }

    return json(res, 200, result);
  } catch (error) {
    return json(res, 500, {
      error: error && error.message ? error.message : "Unexpected server error."
    });
  }
};
