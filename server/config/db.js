"use strict";

const { Pool, types } = require("pg");

// PostgreSQL DATE has no timezone.
// Keep it as YYYY-MM-DD instead of converting it to a UTC Date.
types.setTypeParser(1082, (value) => value);

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  // Every serverless instance creates its own pool. Keeping this deliberately
  // small prevents concurrent cold instances from exhausting Supabase's limit.
  max: positiveInteger(process.env.PG_POOL_MAX, serverless ? 1 : 10),
  connectionTimeoutMillis: positiveInteger(process.env.PG_CONNECTION_TIMEOUT_MS, 10_000),
  idleTimeoutMillis: positiveInteger(process.env.PG_IDLE_TIMEOUT_MS, serverless ? 5_000 : 30_000),
  maxLifetimeSeconds: positiveInteger(process.env.PG_MAX_LIFETIME_SECONDS, 300),
  keepAlive: true,
  allowExitOnIdle: serverless,
  // Stop unexpectedly long queries before they monopolize the small pool.
  statement_timeout: positiveInteger(process.env.PG_STATEMENT_TIMEOUT_MS, 30_000),
});

pool.on("error", (error) => {
  // Idle clients can be terminated by the remote pooler. pg removes that
  // client automatically; the listener prevents an unhandled process crash.
  console.error("Unexpected idle PostgreSQL client error:", error);
});

module.exports = pool;
