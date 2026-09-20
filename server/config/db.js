"use strict";

const { Pool, types } = require("pg");

// PostgreSQL DATE has no timezone.
// Keep it as YYYY-MM-DD instead of converting it to a UTC Date.
types.setTypeParser(1082, (value) => value);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl:
        process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : undefined,

    // Do not allow the application to overwhelm Supabase's
    // session-mode connection limit.
    max: 10,

    // Release idle connections after 10 seconds.
    idleTimeoutMillis: 10000,

    // Fail instead of waiting forever for a connection.
    connectionTimeoutMillis: 10000,

    // Helps detect unexpectedly long-held connections.
    statement_timeout: 30000,
});

pool.on("error", (error) => {
    console.error("PostgreSQL pool error:", error);
});

module.exports = pool;