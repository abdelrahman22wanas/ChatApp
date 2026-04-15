let verifyTokenFn = null;

try {
  ({ verifyToken: verifyTokenFn } = require("@clerk/backend"));
} catch (error) {
  verifyTokenFn = null;
}

function isAuthConfigured() {
  return Boolean(process.env.CLERK_SECRET_KEY);
}

async function requireAuth(req) {
  if (!isAuthConfigured()) {
    return { ok: true, userId: "", authEnabled: false };
  }

  if (!verifyTokenFn) {
    return { ok: false, status: 500, error: "Clerk auth is configured but backend SDK is unavailable." };
  }

  const authHeader = String(req.headers.authorization || "");
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing bearer token." };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return { ok: false, status: 401, error: "Missing bearer token." };
  }

  try {
    const payload = await verifyTokenFn(token, {
      secretKey: process.env.CLERK_SECRET_KEY
    });

    const userId = String(payload.sub || "").trim();
    if (!userId) {
      return { ok: false, status: 401, error: "Invalid auth token." };
    }

    return { ok: true, userId, authEnabled: true };
  } catch (error) {
    return { ok: false, status: 401, error: "Invalid auth token." };
  }
}

module.exports = {
  requireAuth,
  isAuthConfigured
};
