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

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      const result = await listMessages();
      return json(res, 200, result);
    }

    if (req.method === "POST") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

      const user = safeText(payload.user, 32);
      const text = safeText(payload.text, 500);

      if (!user || !text) {
        return json(res, 400, {
          error: "Both user and text are required."
        });
      }

      const result = await appendMessage({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        user,
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
