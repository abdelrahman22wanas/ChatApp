const { applyMessageAction } = require("./_store");

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
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const result = await applyMessageAction({
      room: safeText(payload.room, 24),
      actor: safeText(payload.actor, 32),
      actorRole: safeText(payload.actorRole, 16),
      action: safeText(payload.action, 16),
      messageId: safeText(payload.messageId, 64),
      text: safeText(payload.text, 500)
    });

    if (!result.ok) {
      return json(res, result.code || 400, { error: result.error || "Message action failed." });
    }

    return json(res, 200, result);
  } catch (error) {
    return json(res, 500, {
      error: error && error.message ? error.message : "Unexpected server error."
    });
  }
};
