const { setPresence } = require("./_store");

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
    const result = await setPresence({
      room: safeText(payload.room, 24),
      user: safeText(payload.user, 32),
      active: payload.active !== false
    });

    if (!result.ok) {
      return json(res, result.code || 400, { error: result.error || "Presence update failed." });
    }

    return json(res, 200, result);
  } catch (error) {
    return json(res, 500, {
      error: error && error.message ? error.message : "Unexpected server error."
    });
  }
};
