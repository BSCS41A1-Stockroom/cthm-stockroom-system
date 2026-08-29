"use strict";
const { createClient } = require("@supabase/supabase-js");
const pool = require("../config/db");
const { writeAuditLog } = require("../utils/auditLog");

const ROLES = new Set(["student", "professor", "admin"]);
let adminClient;
function getAdminClient() {
  if (adminClient) return adminClient;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const error = new Error("User invitations are not configured on the server.");
    error.code = "USER_ADMIN_NOT_CONFIGURED";
    throw error;
  }
  adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  return adminClient;
}
function normalizeUser(body = {}) {
  return { email: String(body.email ?? "").trim().toLowerCase(), fullName: String(body.fullName ?? body.full_name ?? "").trim(),
    role: String(body.role ?? "student").toLowerCase(), studentId: String(body.studentId ?? body.student_id ?? "").trim(),
    isActive: body.isActive ?? body.is_active ?? true };
}
function userErrors(user, requireEmail = false) {
  const errors = [];
  if (requireEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) errors.push("A valid email is required.");
  if (!user.fullName || user.fullName.length > 150) errors.push("Full name is required and cannot exceed 150 characters.");
  if (!ROLES.has(user.role)) errors.push("Role must be student, professor, or admin.");
  if (user.role === "student" && (!user.studentId || user.studentId.length > 100)) errors.push("A student ID is required for Student accounts.");
  if (typeof user.isActive !== "boolean") errors.push("Account status is invalid.");
  return errors;
}
async function listUsers(req, res, next) {
  const search = String(req.query.search ?? "").trim().slice(0, 100);
  try {
    const result = await pool.query(`SELECT profile.user_id, users.email, profile.full_name, profile.student_id,
      profile.role, profile.is_active, profile.created_at, profile.updated_at
      FROM public.profiles profile JOIN auth.users users ON users.id = profile.user_id
      WHERE ($1 = '' OR profile.full_name ILIKE '%' || $1 || '%' OR users.email ILIKE '%' || $1 || '%'
        OR profile.student_id ILIKE '%' || $1 || '%') ORDER BY profile.full_name, profile.user_id LIMIT 200`, [search]);
    return res.json({ users: result.rows });
  } catch (error) { return next(error); }
}
async function inviteUser(req, res, next) {
  const user = normalizeUser(req.body); const errors = userErrors(user, true);
  if (errors.length) return res.status(422).json({ error: "INVALID_USER", reasons: errors });
  let invitedId;
  try {
    const { data, error } = await getAdminClient().auth.admin.inviteUserByEmail(user.email, { data: { full_name: user.fullName, student_id: user.studentId || undefined } });
    if (error) return res.status(409).json({ error: "INVITATION_FAILED", message: error.message });
    invitedId = data.user.id;
    const result = await pool.query(`UPDATE public.profiles SET full_name=$2, role=$3, student_id=$4, is_active=$5, updated_at=now()
      WHERE user_id=$1 RETURNING *`, [invitedId, user.fullName, user.role, user.role === "student" ? user.studentId : null, user.isActive]);
    if (!result.rowCount) throw new Error("The invited user profile was not created.");
    await writeAuditLog(pool, req.user, { action: "user_invited", entityType: "user_profile", entityId: invitedId, newValues: { email: user.email, ...result.rows[0] } });
    return res.status(201).json({ user: { email: user.email, ...result.rows[0] } });
  } catch (error) {
    if (invitedId) await getAdminClient().auth.admin.deleteUser(invitedId).catch(() => {});
    if (error.code === "USER_ADMIN_NOT_CONFIGURED") return res.status(503).json({ error: error.code, message: error.message });
    if (error.code === "23505") return res.status(409).json({ error: "STUDENT_ID_IN_USE", message: "That student ID is already assigned to another account." });
    return next(error);
  }
}
async function updateUser(req, res, next) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(400).json({ error: "INVALID_USER_ID", message: "User ID is invalid." });
  }
  const user = normalizeUser(req.body); const errors = userErrors(user);
  if (errors.length) return res.status(422).json({ error: "INVALID_USER", reasons: errors });
  if (req.params.id === req.user.id && (user.role !== "admin" || !user.isActive)) return res.status(409).json({ error: "SELF_LOCKOUT", message: "You cannot demote or deactivate your own account." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('user-management', 0))`);
    const currentResult = await client.query(`SELECT * FROM public.profiles WHERE user_id=$1 FOR UPDATE`, [req.params.id]);
    if (!currentResult.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "USER_NOT_FOUND", message: "User profile was not found." }); }
    const current = currentResult.rows[0];
    if (current.role === "admin" && current.is_active && (user.role !== "admin" || !user.isActive)) {
      const activeAdmins = await client.query(`SELECT user_id FROM public.profiles WHERE role='admin' AND is_active=true ORDER BY user_id FOR UPDATE`);
      if (activeAdmins.rowCount <= 1) { await client.query("ROLLBACK"); return res.status(409).json({ error: "LAST_ADMIN", message: "The last active Admin cannot be demoted or deactivated." }); }
    }
    const result = await client.query(`UPDATE public.profiles SET full_name=$2, role=$3, student_id=$4, is_active=$5, updated_at=now()
      WHERE user_id=$1 RETURNING *`, [req.params.id, user.fullName, user.role, user.role === "student" ? user.studentId : null, user.isActive]);
    await writeAuditLog(client, req.user, { action: "user_profile_updated", entityType: "user_profile", entityId: req.params.id, oldValues: current, newValues: result.rows[0] });
    await client.query("COMMIT"); return res.json({ user: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ error: "STUDENT_ID_IN_USE", message: "That student ID is already assigned to another account." });
    return next(error);
  } finally { client.release(); }
}
module.exports = { inviteUser, listUsers, normalizeUser, updateUser, userErrors };
