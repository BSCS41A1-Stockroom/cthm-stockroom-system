"use strict";

const { createClient } = require("@supabase/supabase-js");
const pool = require("../config/db");

let authClient;

function getAuthClient() {
  if (authClient) return authClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required for authentication.");
  }

  authClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return authClient;
}

function bearerToken(header) {
  const match = /^Bearer\s+(.+)$/i.exec(String(header ?? "").trim());
  return match?.[1] ?? null;
}

function createAuthenticate({ client = null, databasePool = pool } = {}) {
  return async function authenticate(req, res, next) {
    const token = bearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED", message: "Please sign in to continue." });
    }

    try {
      const verifier = client ?? getAuthClient();
      const { data, error } = await verifier.auth.getUser(token);
      if (error || !data?.user) {
        return res.status(401).json({ error: "INVALID_ACCESS_TOKEN", message: "Your session is invalid or has expired." });
      }

      const profileResult = await databasePool.query(
        `SELECT user_id, role, full_name, student_id, is_active
           FROM public.profiles
          WHERE user_id = $1`,
        [data.user.id]
      );
      if (profileResult.rowCount === 0) {
        return res.status(403).json({ error: "PROFILE_REQUIRED", message: "Your account profile has not been configured." });
      }
      if (profileResult.rows[0].is_active === false) {
        return res.status(403).json({ error: "ACCOUNT_DISABLED", message: "Your account has been deactivated. Contact an administrator." });
      }

      req.user = Object.freeze({
        id: data.user.id,
        email: data.user.email,
        ...profileResult.rows[0],
      });
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function requireRoles(...roles) {
  const allowed = new Set(roles);
  return function authorize(req, res, next) {
    if (!req.user || !allowed.has(req.user.role)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "You do not have permission to perform this action." });
    }
    return next();
  };
}

module.exports = {
  authenticate: createAuthenticate(),
  bearerToken,
  createAuthenticate,
  requireRoles,
};
