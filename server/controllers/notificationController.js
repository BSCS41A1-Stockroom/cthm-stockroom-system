"use strict";
const pool = require("../config/db");

function isValidNotificationId(value) {
  return /^[1-9]\d*$/.test(String(value ?? ""));
}

async function listNotifications(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, type, title, message, related_path, entity_type, entity_id, read_at, created_at,
              count(*) filter (where read_at is null) over()::integer AS unread_count
         FROM public.notifications WHERE recipient_user_id = $1
        ORDER BY created_at DESC, id DESC LIMIT 30`, [req.user.id]
    );
    return res.json({ notifications: result.rows.map(({ unread_count, ...row }) => row), unreadCount: result.rows[0]?.unread_count ?? 0 });
  } catch (error) { return next(error); }
}

async function markNotificationRead(req, res, next) {
  if (!isValidNotificationId(req.params.id)) return res.status(400).json({ error: "INVALID_NOTIFICATION_ID", message: "Notification ID is invalid." });
  try {
    const result = await pool.query(
      `UPDATE public.notifications SET read_at = coalesce(read_at, now())
        WHERE id = $1 AND recipient_user_id = $2 RETURNING id, read_at`, [req.params.id, req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "NOTIFICATION_NOT_FOUND", message: "Notification was not found." });
    return res.json({ notification: result.rows[0] });
  } catch (error) { return next(error); }
}

async function markAllNotificationsRead(req, res, next) {
  try {
    const result = await pool.query(
      `UPDATE public.notifications SET read_at = now()
        WHERE recipient_user_id = $1 AND read_at IS NULL RETURNING id`, [req.user.id]
    );
    return res.json({ updated: result.rowCount });
  } catch (error) { return next(error); }
}

module.exports = { isValidNotificationId, listNotifications, markAllNotificationsRead, markNotificationRead };
