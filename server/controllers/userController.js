"use strict";
const { createClient } = require("@supabase/supabase-js");
const pool = require("../config/db");
const { writeAuditLog } = require("../utils/auditLog");

const ROLES = new Set(["student", "professor", "staff", "admin"]);
let adminClient;
function cleanEnvironmentValue(value) {
  let cleaned = String(value ?? "").trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned.replace(/\s+/g, "");
}
function serviceRoleKey(value) {
  if (/^\s*["']?Bearer\s/i.test(String(value ?? ""))) return null;
  const key = cleanEnvironmentValue(value);
  if (!key) return null;
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) return key;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return null;
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
    return payload.role === "service_role" ? key : null;
  } catch { return null; }
}
function invitationRedirectUrl(clientUrl = process.env.CLIENT_URL) {
  const origin = String(clientUrl ?? "").split(",")[0].trim();
  if (!origin) throw new Error("CLIENT_URL is required for account invitations.");
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("CLIENT_URL must use HTTPS for account invitations.");
  }
  return new URL("/set-password", url).toString();
}
function getAdminClient() {
  if (adminClient) return adminClient;
  const url = cleanEnvironmentValue(process.env.SUPABASE_URL);
  const key = serviceRoleKey(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) {
    const error = new Error("User invitations are not configured on the server.");
    error.code = "USER_ADMIN_NOT_CONFIGURED";
    throw error;
  }
  let parsedUrl;
  try { parsedUrl = new URL(url); }
  catch { parsedUrl = null; }
  if (!parsedUrl || parsedUrl.protocol !== "https:" || !parsedUrl.hostname.endsWith(".supabase.co")) {
    const error = new Error("SUPABASE_URL is invalid on the server.");
    error.code = "USER_ADMIN_NOT_CONFIGURED";
    throw error;
  }
  adminClient = createClient(parsedUrl.toString().replace(/\/$/, ""), key, { auth: { autoRefreshToken: false, persistSession: false } });
  return adminClient;
}
function normalizeUser(body = {}) {
  return { email: String(body.email ?? "").trim().toLowerCase(), fullName: String(body.fullName ?? body.full_name ?? "").trim(),
    role: String(body.role ?? "student").toLowerCase(), studentId: String(body.studentId ?? body.student_id ?? "").trim(),
    departmentId: body.departmentId ?? body.department_id ?? null,
    isActive: body.isActive ?? body.is_active ?? true };
}
function userErrors(user, requireEmail = false) {
  const errors = [];
  if (requireEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) errors.push("A valid email is required.");
  if (!user.fullName || user.fullName.length > 150) errors.push("Full name is required and cannot exceed 150 characters.");
  if (!ROLES.has(user.role)) errors.push("Role must be student, professor, staff, or admin.");
  if (user.role === "student" && (!user.studentId || user.studentId.length > 100)) errors.push("A student ID is required for Student accounts.");
  if (["professor", "staff"].includes(user.role) && !/^[1-9]\d*$/.test(String(user.departmentId ?? ""))) errors.push("An active department is required for Professor and Staff accounts.");
  if (typeof user.isActive !== "boolean") errors.push("Account status is invalid.");
  return errors;
}
async function professorDepartmentExists(user) {
  if (!["professor", "staff"].includes(user.role)) return true;
  const result = await pool.query(`SELECT 1 FROM public.academic_departments WHERE id=$1 AND is_active=true`, [user.departmentId]);
  return result.rowCount > 0;
}
async function listUsers(req, res, next) {
  const search = String(req.query.search ?? "").trim().slice(0, 100);
  try {
    const result = await pool.query(`SELECT profile.user_id, users.email, profile.full_name, profile.student_id,
      profile.role, profile.is_active, profile.department_id,department.name AS department_name,profile.qr_status, profile.qr_issued_at,
      profile.qr_last_printed_at, profile.created_at, profile.updated_at
      FROM public.profiles profile JOIN auth.users users ON users.id = profile.user_id
      LEFT JOIN public.academic_departments department ON department.id=profile.department_id
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
    if (!await professorDepartmentExists(user)) return res.status(422).json({ error: "INVALID_DEPARTMENT", message: "Select an active department for this professor." });
    const { data, error } = await getAdminClient().auth.admin.inviteUserByEmail(user.email, {
      data: { full_name: user.fullName, student_id: user.studentId || undefined },
      redirectTo: invitationRedirectUrl(),
    });
    if (error) return res.status(409).json({ error: "INVITATION_FAILED", message: error.message });
    invitedId = data.user.id;
    const result = await pool.query(`UPDATE public.profiles SET full_name=$2, role=$3, student_id=$4, is_active=$5,department_id=$6,updated_at=now()
      WHERE user_id=$1 RETURNING *`, [invitedId, user.fullName, user.role, user.role === "student" ? user.studentId : null, user.isActive, ["professor", "staff"].includes(user.role) ? user.departmentId : null]);
    if (!result.rowCount) throw new Error("The invited user profile was not created.");
    await writeAuditLog(pool, req.user, { action: "user_invited", entityType: "user_profile", entityId: invitedId, newValues: { email: user.email, ...result.rows[0] } });
    return res.status(201).json({ user: { email: user.email, ...result.rows[0] } });
  } catch (error) {
    if (invitedId) await getAdminClient().auth.admin.deleteUser(invitedId).catch(() => {});
    if (error.code === "USER_ADMIN_NOT_CONFIGURED" || /invalid header value/i.test(String(error.message))) {
      return res.status(503).json({ error: "USER_ADMIN_NOT_CONFIGURED", message: "User invitations are unavailable because the server's Supabase Admin credentials are invalid. Ask an administrator to update SUPABASE_SECRET_KEY." });
    }
    if (error.message === "CLIENT_URL is required for account invitations." || error.message === "CLIENT_URL must use HTTPS for account invitations.") {
      return res.status(503).json({ error: "INVITATION_REDIRECT_NOT_CONFIGURED", message: error.message });
    }
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
    if (!await professorDepartmentExists(user)) return res.status(422).json({ error: "INVALID_DEPARTMENT", message: "Select an active department for this professor." });
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('user-management', 0))`);
    const currentResult = await client.query(`SELECT * FROM public.profiles WHERE user_id=$1 FOR UPDATE`, [req.params.id]);
    if (!currentResult.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "USER_NOT_FOUND", message: "User profile was not found." }); }
    const current = currentResult.rows[0];
    if (current.role === "admin" && current.is_active && (user.role !== "admin" || !user.isActive)) {
      const activeAdmins = await client.query(`SELECT user_id FROM public.profiles WHERE role='admin' AND is_active=true ORDER BY user_id FOR UPDATE`);
      if (activeAdmins.rowCount <= 1) { await client.query("ROLLBACK"); return res.status(409).json({ error: "LAST_ADMIN", message: "The last active Admin cannot be demoted or deactivated." }); }
    }
    const result = await client.query(`UPDATE public.profiles SET full_name=$2, role=$3, student_id=$4, is_active=$5,department_id=$6,updated_at=now()
      WHERE user_id=$1 RETURNING *`, [req.params.id, user.fullName, user.role, user.role === "student" ? user.studentId : null, user.isActive, ["professor", "staff"].includes(user.role) ? user.departmentId : null]);
    if (current.role === "student" && user.role !== "student") {
      await client.query(`UPDATE public.profiles SET qr_status='revoked', qr_version=qr_version+1,
        qr_revoked_at=now(), qr_revocation_reason='Account role changed from Student', updated_at=now() WHERE user_id=$1`, [req.params.id]);
    } else if (current.role !== "student" && user.role === "student") {
      await client.query(`UPDATE public.profiles SET qr_status='not_issued', qr_public_id=gen_random_uuid(),
        qr_version=qr_version+1, qr_issued_at=null, qr_issued_by=null, qr_revoked_at=null,
        qr_revocation_reason=null, updated_at=now() WHERE user_id=$1`, [req.params.id]);
    }
    await writeAuditLog(client, req.user, { action: "user_profile_updated", entityType: "user_profile", entityId: req.params.id, oldValues: current, newValues: result.rows[0] });
    await client.query("COMMIT"); return res.json({ user: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ error: "STUDENT_ID_IN_USE", message: "That student ID is already assigned to another account." });
    return next(error);
  } finally { client.release(); }
}
module.exports = { cleanEnvironmentValue, inviteUser, invitationRedirectUrl, listUsers, normalizeUser, serviceRoleKey, updateUser, userErrors };
