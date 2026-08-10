"use strict";

const { Pool, types } = require("pg");

// PostgreSQL DATE has no timezone. Keep it as YYYY-MM-DD instead of allowing
// node-postgres to convert it into a UTC Date that shifts in Asia/Manila.
types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

module.exports = pool;
