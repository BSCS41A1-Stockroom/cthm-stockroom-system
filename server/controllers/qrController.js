"use strict";

const pool = require("../config/db");
const { writeAuditLog } = require("../utils/auditLog");
const { createAccountQr, createClaimTicket, parseAccountQr } = require("../utils/qrCredential");

async function getMyQr(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT qr_public_id, qr_version, qr_revoked_at FROM public.profiles WHERE user_id=$1`, [req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "PROFILE_NOT_FOUND", message: "Profile was not found." });
    const qr = result.rows[0];
    return res.json({ token: createAccountQr(qr.qr_public_id, qr.qr_version), revoked: Boolean(qr.qr_revoked_at) });
  } catch (error) {
    if (error.code === "QR_NOT_CONFIGURED") return res.status(503).json({ error: error.code, message: error.message });
    return next(error);
  }
}

async function regenerateMyQr(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE public.profiles SET qr_public_id=gen_random_uuid(), qr_version=qr_version+1,
              qr_revoked_at=null, updated_at=now() WHERE user_id=$1
        RETURNING qr_public_id, qr_version`, [req.user.id]
    );
    await writeAuditLog(client, req.user, { action: "account_qr_regenerated", entityType: "user_profile", entityId: req.user.id });
    await client.query("COMMIT");
    return res.json({ token: createAccountQr(result.rows[0].qr_public_id, result.rows[0].qr_version) });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "QR_NOT_CONFIGURED") return res.status(503).json({ error: error.code, message: error.message });
    return next(error);
  } finally { client.release(); }
}

async function lookupReadyRequest(req, res, next) {
  let parsed;
  try { parsed = parseAccountQr(req.body?.token); }
  catch (error) {
    if (error.code === "QR_NOT_CONFIGURED") return res.status(503).json({ error: error.code, message: error.message });
    return next(error);
  }
  if (!parsed) return res.status(400).json({ error: "INVALID_QR", message: "This account QR code is invalid." });
  try {
    const profileResult = await pool.query(
      `SELECT user_id, full_name, student_id, role, is_active, qr_version, qr_revoked_at
         FROM public.profiles WHERE qr_public_id=$1`, [parsed.publicId]
    );
    const profile = profileResult.rows[0];
    if (!profile || profile.qr_version !== parsed.version || profile.qr_revoked_at || !profile.is_active) {
      return res.status(404).json({ error: "QR_NOT_ACTIVE", message: "This QR code is revoked, outdated, or belongs to an inactive account." });
    }
    const requests = await pool.query(
      `SELECT request.id, request.borrow_date, request.return_date, request.purpose,
              json_agg(json_build_object('inventoryId', item.inventory_id, 'name', inventory.item_name, 'quantity', item.quantity) ORDER BY item.inventory_id) AS items
         FROM public.borrow_requests request
         JOIN public.borrow_request_items item ON item.request_id=request.id
         JOIN public.inventory inventory ON inventory.id=item.inventory_id
        WHERE request.user_id=$1 AND request.status='Approved'
        GROUP BY request.id ORDER BY request.created_at LIMIT 2`, [profile.user_id]
    );
    await writeAuditLog(pool, req.user, { action: requests.rowCount ? "account_qr_lookup_succeeded" : "account_qr_lookup_no_request", entityType: "user_profile", entityId: profile.user_id });
    if (!requests.rowCount) return res.status(404).json({ error: "NO_READY_REQUEST", message: "This account has no request ready for claim." });
    if (requests.rowCount > 1) return res.status(409).json({ error: "MULTIPLE_READY_REQUESTS", message: "Multiple ready requests were found. Resolve the account records before release." });
    const request = requests.rows[0];
    const expiresAt = Date.now() + 5 * 60 * 1000;
    return res.json({
      borrower: { fullName: profile.full_name, studentId: profile.student_id, role: profile.role },
      request: { id: request.id, borrowDate: request.borrow_date, returnDate: request.return_date, purpose: request.purpose, items: request.items },
      claimToken: createClaimTicket({ requestId: request.id, userId: profile.user_id, staffId: req.user.id, expiresAt }),
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (error) { return next(error); }
}

module.exports = { getMyQr, lookupReadyRequest, regenerateMyQr };
