"use strict";

const crypto = require("node:crypto");
const pool = require("../config/db");
const { writeAuditLog } = require("../utils/auditLog");
const { notifyUser } = require("../utils/notifications");
const { createAccountQr, createClaimTicket, parseAccountQr } = require("../utils/qrCredential");

const PAIR_TOKEN_PATTERN = /^pair\.v1\.([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hashPairSecret = (secret) => crypto.createHash("sha256").update(secret).digest("hex");
const pairHashMatches = (left, right) => {
  const a = Buffer.from(String(left)); const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
function parsePairToken(token) {
  const match = PAIR_TOKEN_PATTERN.exec(String(token ?? "").trim());
  return match ? { id: match[1], secret: match[2] } : null;
}

async function findActiveProfileFromQr(token, database = pool) {
  const parsed = parseAccountQr(token);
  if (!parsed) { const error = new Error("This account QR code is invalid."); error.code = "INVALID_QR"; throw error; }
  const result = await database.query(
    `SELECT user_id, full_name, student_id, role, is_active, qr_version, qr_revoked_at, qr_status
       FROM public.profiles WHERE qr_public_id=$1`, [parsed.publicId]
  );
  const profile = result.rows[0];
  if (!profile || profile.qr_version !== parsed.version || profile.qr_revoked_at || profile.qr_status !== "active" || !profile.is_active) {
    const error = new Error("This QR code is not issued, revoked, outdated, or belongs to an inactive account."); error.code = "QR_NOT_ACTIVE"; throw error;
  }
  return profile;
}

async function findReadyRequest(userId, database = pool) {
  const requests = await database.query(
    `SELECT request.id, request.borrow_date, request.return_date, request.purpose,
            json_agg(json_build_object('inventoryId', item.inventory_id, 'name', inventory.item_name, 'quantity', item.quantity, 'trackingType', inventory.tracking_type) ORDER BY item.inventory_id) AS items
       FROM public.borrow_requests request
       JOIN public.borrow_request_items item ON item.request_id=request.id
       JOIN public.inventory inventory ON inventory.id=item.inventory_id
      WHERE request.user_id=$1 AND request.status='Approved'
        AND request.borrow_date >= (now() AT TIME ZONE 'Asia/Manila')::date
      GROUP BY request.id ORDER BY request.created_at LIMIT 2`, [userId]
  );
  if (!requests.rowCount) { const error = new Error("This account has no request ready for claim."); error.code = "NO_READY_REQUEST"; throw error; }
  if (requests.rowCount > 1) { const error = new Error("Multiple ready requests were found. Resolve the account records before release."); error.code = "MULTIPLE_READY_REQUESTS"; throw error; }
  return requests.rows[0];
}

async function findBorrowedRequests(userId, database = pool) {
  const result = await database.query(
    `SELECT request.id, request.borrow_date, request.return_date, request.purpose,
            json_agg(json_build_object(
              'inventoryId', item.inventory_id, 'name', inventory.item_name,
              'quantity', item.quantity, 'trackingType', inventory.tracking_type,
              'accountedQuantity', COALESCE(returned.accounted, 0),
              'outstandingQuantity', GREATEST(item.quantity-COALESCE(returned.accounted, 0), 0)
              ,'assets', (SELECT COALESCE(json_agg(json_build_object(
                'id', asset.id, 'assetNumber', asset.asset_number, 'serialNumber', asset.serial_number
              ) ORDER BY asset.asset_number), '[]'::json)
                FROM public.borrowing_asset_assignments assignment
                JOIN public.inventory_assets asset ON asset.id=assignment.asset_id
                WHERE assignment.request_id=request.id AND assignment.inventory_id=item.inventory_id
                  AND assignment.returned_at IS NULL)
            ) ORDER BY item.inventory_id) AS items
       FROM public.borrow_requests request
       JOIN public.borrow_request_items item ON item.request_id=request.id
       JOIN public.inventory inventory ON inventory.id=item.inventory_id
       LEFT JOIN (
         SELECT request_id, inventory_id,
                SUM(good_quantity+damaged_quantity+missing_quantity)::integer AS accounted
           FROM public.borrowing_return_items GROUP BY request_id, inventory_id
       ) returned ON returned.request_id=request.id AND returned.inventory_id=item.inventory_id
      WHERE request.user_id=$1 AND request.status='Borrowed'
      GROUP BY request.id ORDER BY request.return_date, request.id LIMIT 20`, [userId]
  );
  if (!result.rowCount) { const error = new Error("This account has no outstanding borrowed transaction."); error.code = "NO_ACTIVE_BORROWING"; throw error; }
  return result.rows;
}

function claimResponse(profile, request, staffId) {
  const expiresAt = Date.now() + 5 * 60 * 1000;
  return {
    borrower: { fullName: profile.full_name, studentId: profile.student_id, role: profile.role },
    request: { id: request.id, borrowDate: request.borrow_date, returnDate: request.return_date, purpose: request.purpose, items: request.items },
    claimToken: createClaimTicket({ requestId: request.id, userId: profile.user_id, staffId, qrVersion: profile.qr_version, expiresAt }),
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

async function getMyQr(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT qr_public_id, qr_version, qr_revoked_at, qr_status FROM public.profiles WHERE user_id=$1`, [req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "PROFILE_NOT_FOUND", message: "Profile was not found." });
    const qr = result.rows[0];
    if (qr.qr_status !== "active" || qr.qr_revoked_at) {
      return res.status(409).json({ error: "QR_NOT_ISSUED", message: "Your physical account QR has not been issued or currently requires replacement. Contact an administrator." });
    }
    return res.json({ token: createAccountQr(qr.qr_public_id, qr.qr_version), revoked: Boolean(qr.qr_revoked_at) });
  } catch (error) {
    if (error.code === "QR_NOT_CONFIGURED") return res.status(503).json({ error: error.code, message: error.message });
    return next(error);
  }
}

async function loadManagedQrProfile(client, userId, lock = false) {
  if (!UUID_PATTERN.test(userId)) { const error = new Error("User ID is invalid."); error.code = "INVALID_USER_ID"; throw error; }
  const result = await client.query(
    `SELECT user_id, full_name, student_id, role, is_active, qr_public_id, qr_version,
            qr_status, qr_issued_at, qr_last_printed_at, qr_revoked_at, qr_revocation_reason
       FROM public.profiles WHERE user_id=$1${lock ? " FOR UPDATE" : ""}`, [userId]
  );
  if (!result.rowCount) { const error = new Error("User profile was not found."); error.code = "USER_NOT_FOUND"; throw error; }
  if (result.rows[0].role !== "student") { const error = new Error("Physical account QR codes can only be managed for Student accounts."); error.code = "QR_STUDENT_ONLY"; throw error; }
  return result.rows[0];
}

function managedQrResponse(profile) {
  return {
    userId: profile.user_id, fullName: profile.full_name, studentId: profile.student_id,
    isActive: profile.is_active, status: profile.qr_status, issuedAt: profile.qr_issued_at,
    lastPrintedAt: profile.qr_last_printed_at, revokedAt: profile.qr_revoked_at,
    revocationReason: profile.qr_revocation_reason,
    token: profile.qr_status === "revoked" || profile.qr_revoked_at ? null : createAccountQr(profile.qr_public_id, profile.qr_version),
  };
}

async function getManagedUserQr(req, res, next) {
  try { return res.json(managedQrResponse(await loadManagedQrProfile(pool, req.params.id))); }
  catch (error) {
    const statuses = { INVALID_USER_ID: 400, USER_NOT_FOUND: 404, QR_STUDENT_ONLY: 422 };
    if (error.code === "QR_NOT_CONFIGURED") return res.status(503).json({ error: error.code, message: error.message });
    if (statuses[error.code]) return res.status(statuses[error.code]).json({ error: error.code, message: error.message });
    return next(error);
  }
}

async function mutateManagedQr(req, res, next, action) {
  const reason = String(req.body?.reason ?? "").trim();
  if (["revoke", "replace"].includes(action) && (reason.length < 5 || reason.length > 500)) {
    return res.status(422).json({ error: "QR_REASON_REQUIRED", message: "Enter a reason between 5 and 500 characters." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await loadManagedQrProfile(client, req.params.id, true);
    let result;
    if (action === "issue") {
      if (!current.is_active) { await client.query("ROLLBACK"); return res.status(409).json({ error: "ACCOUNT_INACTIVE", message: "Activate the student account before issuing its QR." }); }
      if (current.qr_status === "revoked") { await client.query("ROLLBACK"); return res.status(409).json({ error: "QR_REPLACEMENT_REQUIRED", message: "Generate a replacement before issuing this revoked QR." }); }
      result = await client.query(`UPDATE public.profiles SET qr_status='active', qr_issued_at=now(), qr_issued_by=$2, qr_revoked_at=null, qr_revocation_reason=null, updated_at=now() WHERE user_id=$1 RETURNING *`, [current.user_id, req.user.id]);
    } else if (action === "revoke") {
      result = await client.query(`UPDATE public.profiles SET qr_status='revoked', qr_version=qr_version+1, qr_revoked_at=now(), qr_revocation_reason=$2, updated_at=now() WHERE user_id=$1 RETURNING *`, [current.user_id, reason]);
    } else if (action === "replace") {
      result = await client.query(`UPDATE public.profiles SET qr_status='replacement_required', qr_public_id=gen_random_uuid(), qr_version=qr_version+1, qr_issued_at=null, qr_issued_by=null, qr_revoked_at=null, qr_revocation_reason=$2, updated_at=now() WHERE user_id=$1 RETURNING *`, [current.user_id, reason]);
    } else if (action === "print") {
      if (current.qr_status === "revoked") { await client.query("ROLLBACK"); return res.status(409).json({ error: "QR_REVOKED", message: "A revoked QR cannot be printed. Generate its replacement first." }); }
      result = await client.query(`UPDATE public.profiles SET qr_last_printed_at=now(), qr_last_printed_by=$2, updated_at=now() WHERE user_id=$1 RETURNING *`, [current.user_id, req.user.id]);
    }
    const actionNames = { issue: "account_qr_issued", revoke: "account_qr_revoked", replace: "account_qr_replaced", print: "account_qr_print_prepared" };
    await writeAuditLog(client, req.user, { action: actionNames[action], entityType: "user_profile", entityId: current.user_id, oldValues: { qrStatus: current.qr_status }, newValues: { qrStatus: result.rows[0].qr_status }, metadata: reason ? { reason } : {} });
    if (action !== "print") await notifyUser(client, current.user_id, {
      type: `account_qr_${action === "replace" ? "replaced" : action === "revoke" ? "revoked" : "issued"}`,
      title: action === "issue" ? "Account QR issued" : action === "revoke" ? "Account QR revoked" : "Replacement QR generated",
      message: action === "issue" ? "Your physical account QR is now active." : action === "revoke" ? `Your account QR was revoked: ${reason}` : "A replacement account QR was generated and must be issued by the stockroom.",
      relatedPath: "/my-qr", entityType: "user_profile", entityId: current.user_id,
    });
    await client.query("COMMIT");
    return res.json(managedQrResponse(result.rows[0]));
  } catch (error) {
    await client.query("ROLLBACK");
    const statuses = { INVALID_USER_ID: 400, USER_NOT_FOUND: 404, QR_STUDENT_ONLY: 422 };
    if (error.code === "QR_NOT_CONFIGURED") return res.status(503).json({ error: error.code, message: error.message });
    if (statuses[error.code]) return res.status(statuses[error.code]).json({ error: error.code, message: error.message });
    return next(error);
  } finally { client.release(); }
}

const issueManagedUserQr = (req, res, next) => mutateManagedQr(req, res, next, "issue");
const revokeManagedUserQr = (req, res, next) => mutateManagedQr(req, res, next, "revoke");
const replaceManagedUserQr = (req, res, next) => mutateManagedQr(req, res, next, "replace");
const recordManagedUserQrPrint = (req, res, next) => mutateManagedQr(req, res, next, "print");

async function lookupReadyRequest(req, res, next) {
  const mode = req.body?.mode ?? "claim";
  if (!["claim", "return"].includes(mode)) return res.status(422).json({ error: "INVALID_SCAN_MODE", message: "Scan mode must be claim or return." });
  try {
    const profile = await findActiveProfileFromQr(req.body?.token);
    if (mode === "return") {
      const requests = await findBorrowedRequests(profile.user_id);
      await writeAuditLog(pool, req.user, { action: "return_qr_lookup_succeeded", entityType: "user_profile", entityId: profile.user_id });
      return res.json({ mode: "return", borrower: { fullName: profile.full_name, studentId: profile.student_id, role: profile.role }, requests });
    }
    const request = await findReadyRequest(profile.user_id);
    await writeAuditLog(pool, req.user, { action: "account_qr_lookup_succeeded", entityType: "user_profile", entityId: profile.user_id });
    return res.json(claimResponse(profile, request, req.user.id));
  } catch (error) {
    if (error.code === "QR_NOT_CONFIGURED") return res.status(503).json({ error: error.code, message: error.message });
    const statuses = { INVALID_QR: 400, QR_NOT_ACTIVE: 404, NO_READY_REQUEST: 404, NO_ACTIVE_BORROWING: 404, MULTIPLE_READY_REQUESTS: 409 };
    if (statuses[error.code]) return res.status(statuses[error.code]).json({ error: error.code, message: error.message });
    return next(error);
  }
}

async function createScannerPairing(req, res, next) {
  const secret = crypto.randomBytes(32).toString("base64url");
  const mode = req.body?.mode ?? "claim";
  if (!["claim", "return"].includes(mode)) return res.status(422).json({ error: "INVALID_SCAN_MODE", message: "Scan mode must be claim or return." });
  try {
    await pool.query(`DELETE FROM public.qr_scanner_sessions WHERE expires_at < now() - interval '1 day'`);
    const result = await pool.query(
      `INSERT INTO public.qr_scanner_sessions (staff_user_id, secret_hash, scan_mode, expires_at)
       VALUES ($1,$2,$3,now()+interval '5 minutes') RETURNING id, scan_mode, expires_at`, [req.user.id, hashPairSecret(secret), mode]
    );
    const session = result.rows[0];
    await writeAuditLog(pool, req.user, { action: "phone_scanner_pairing_created", entityType: "qr_scanner_session", entityId: session.id });
    return res.status(201).json({ id: session.id, mode: session.scan_mode, pairToken: `pair.v1.${session.id}.${secret}`, expiresAt: session.expires_at });
  } catch (error) { return next(error); }
}

async function submitPairedScan(req, res, next) {
  const pair = parsePairToken(req.body?.pairToken);
  if (!pair) return res.status(400).json({ error: "INVALID_PAIRING", message: "The scanner pairing link is invalid." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sessionResult = await client.query(`SELECT * FROM public.qr_scanner_sessions WHERE id=$1 FOR UPDATE`, [pair.id]);
    const session = sessionResult.rows[0];
    if (!session || session.staff_user_id !== req.user.id || !pairHashMatches(session.secret_hash, hashPairSecret(pair.secret))) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "PAIRING_FORBIDDEN", message: "This pairing belongs to a different staff account or is invalid." });
    }
    if (session.status === "closed" || new Date(session.expires_at).getTime() <= Date.now()) {
      await client.query("ROLLBACK");
      return res.status(410).json({ error: "PAIRING_EXPIRED", message: "This scanner pairing has expired. Create a new pairing on the PC." });
    }
    if (!["waiting", "connected"].includes(session.status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "PAIRING_ALREADY_USED", message: "This pairing has already received a scan." });
    }
    const profile = await findActiveProfileFromQr(req.body?.accountToken, client);
    if (session.scan_mode === "return") await findBorrowedRequests(profile.user_id, client);
    else await findReadyRequest(profile.user_id, client);
    await client.query(
      `UPDATE public.qr_scanner_sessions SET status='scanned', scanned_user_id=$2,
              scan_sequence=scan_sequence+1, updated_at=now() WHERE id=$1`, [pair.id, profile.user_id]
    );
    await writeAuditLog(client, req.user, { action: "paired_account_qr_scanned", entityType: "user_profile", entityId: profile.user_id, metadata: { pairingSessionId: pair.id } });
    await client.query("COMMIT");
    return res.json({ message: "QR scanned successfully. Continue on the paired PC." });
  } catch (error) {
    await client.query("ROLLBACK");
    const statuses = { INVALID_QR: 400, QR_NOT_ACTIVE: 404, NO_READY_REQUEST: 404, NO_ACTIVE_BORROWING: 404, MULTIPLE_READY_REQUESTS: 409 };
    if (error.code === "QR_NOT_CONFIGURED") return res.status(503).json({ error: error.code, message: error.message });
    if (statuses[error.code]) return res.status(statuses[error.code]).json({ error: error.code, message: error.message });
    return next(error);
  } finally { client.release(); }
}

async function joinScannerPairing(req, res, next) {
  const pair = parsePairToken(req.body?.pairToken);
  if (!pair) return res.status(400).json({ error: "INVALID_PAIRING", message: "The scanner pairing link is invalid." });
  try {
    const result = await pool.query(
      `UPDATE public.qr_scanner_sessions SET status='connected', updated_at=now()
        WHERE id=$1 AND staff_user_id=$2 AND secret_hash=$3 AND status IN ('waiting','connected') AND expires_at>now()
        RETURNING id, expires_at`, [pair.id, req.user.id, hashPairSecret(pair.secret)]
    );
    if (!result.rowCount) return res.status(403).json({ error: "PAIRING_FORBIDDEN", message: "This pairing is invalid, expired, already used, or belongs to another staff account." });
    return res.json({ status: "connected", expiresAt: result.rows[0].expires_at });
  } catch (error) { return next(error); }
}

async function getPairingResult(req, res, next) {
  if (!UUID_PATTERN.test(req.params.id)) return res.status(400).json({ error: "INVALID_PAIRING", message: "Scanner pairing ID is invalid." });
  try {
    const result = await pool.query(
      `SELECT session.*, profile.full_name, profile.student_id, profile.role, profile.is_active,
              profile.qr_version, profile.qr_status, profile.qr_revoked_at
         FROM public.qr_scanner_sessions session
         LEFT JOIN public.profiles profile ON profile.user_id=session.scanned_user_id
        WHERE session.id=$1 AND session.staff_user_id=$2`, [req.params.id, req.user.id]
    );
    const session = result.rows[0];
    if (!session) return res.status(404).json({ error: "PAIRING_NOT_FOUND", message: "Scanner pairing was not found." });
    if (session.status === "closed" || new Date(session.expires_at).getTime() <= Date.now()) return res.status(410).json({ error: "PAIRING_EXPIRED", message: "Scanner pairing expired." });
    if (session.status !== "scanned" || !session.scanned_user_id) return res.json({ status: session.status, expiresAt: session.expires_at });
    if (!session.is_active || session.qr_status !== "active" || session.qr_revoked_at) return res.status(404).json({ error: "ACCOUNT_INACTIVE", message: "The scanned account or its QR is no longer active." });
    if (session.scan_mode === "return") {
      const requests = await findBorrowedRequests(session.scanned_user_id);
      return res.json({ mode: "return", borrower: { fullName: session.full_name, studentId: session.student_id, role: session.role }, requests });
    }
    const request = await findReadyRequest(session.scanned_user_id);
    return res.json(claimResponse({ user_id: session.scanned_user_id, full_name: session.full_name, student_id: session.student_id, role: session.role, qr_version: session.qr_version }, request, req.user.id));
  } catch (error) {
    const statuses = { NO_READY_REQUEST: 404, NO_ACTIVE_BORROWING: 404, MULTIPLE_READY_REQUESTS: 409 };
    if (error.code === "QR_NOT_CONFIGURED") return res.status(503).json({ error: error.code, message: error.message });
    if (statuses[error.code]) return res.status(statuses[error.code]).json({ error: error.code, message: error.message });
    return next(error);
  }
}

async function closeScannerPairing(req, res, next) {
  if (!UUID_PATTERN.test(req.params.id)) return res.status(400).json({ error: "INVALID_PAIRING", message: "Scanner pairing ID is invalid." });
  try {
    const result = await pool.query(
      `UPDATE public.qr_scanner_sessions SET status='closed', updated_at=now()
        WHERE id=$1 AND staff_user_id=$2 RETURNING id`, [req.params.id, req.user.id]
    );
    return result.rowCount ? res.status(204).end() : res.status(404).json({ error: "PAIRING_NOT_FOUND", message: "Scanner pairing was not found." });
  } catch (error) { return next(error); }
}

module.exports = { closeScannerPairing, createScannerPairing, getManagedUserQr, getMyQr, getPairingResult, issueManagedUserQr, joinScannerPairing, lookupReadyRequest, recordManagedUserQrPrint, replaceManagedUserQr, revokeManagedUserQr, submitPairedScan };
