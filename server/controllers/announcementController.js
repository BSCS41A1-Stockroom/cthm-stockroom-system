"use strict";
const pool = require("../config/db");

async function listAnnouncements(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, title, description, published_at FROM announcements
        WHERE is_active = true AND published_at <= now()
        ORDER BY published_at DESC, id DESC LIMIT 10`
    );
    return res.json({ announcements: result.rows });
  } catch (error) {
    return next(error);
  }
}
module.exports = { listAnnouncements };
