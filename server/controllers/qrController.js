"use strict";

const crypto = require("node:crypto");
const pool = require("../config/db");
const { writeAuditLog } = require("../utils/auditLog");
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
    `SELECT user_id, full_name, student_id, role, is_active, qr_version, qr_revoked_at
       FROM public.profiles WHERE qr_public_id=$1`, [parsed.publicId]
  );
  const profile = result.rows[0];
  if (!profile || profile.qr_version !== parsed.version || profile.qr_revoked_at || !profile.is_active) {
    const error = new Error("This QR code is revoked, outdated, or belongs to an inactive account."); error.code = "QR_NOT_ACTIVE"; throw error;
  }
  return profile;
}

async function findReadyRequest(userId, database = pool) {
  const requests = await database.query(
    `SELECT request.id, request.borrow_date, request.return_date, request.purpose,
            json_agg(json_build_object('inventoryId', item.inventory_id, 'name', inventory.item_name, 'quantity', item.quantity) ORDER BY item.inventory_id) AS items
       FROM public.borrow_requests request
       JOIN public.borrow_request_items item ON item.request_id=request.id
       JOIN public.inventory inventory ON inventory.id=item.inventory_id
      WHERE request.user_id=$1 AND request.status='Approved'
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
              'quantity', item.quantity,
              'accountedQuantity', COALESCE(returned.accounted, 0),
              'outstandingQuantity', GREATEST(item.quantity-COALESCE(returned.accounted, 0), 0)
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
    claimToken: createClaimTicket({ requestId: request.id, userId: profile.user_id, staffId, expiresAt }),
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

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
      `SELECT session.*, profile.full_name, profile.student_id, profile.role, profile.is_active
         FROM public.qr_scanner_sessions session
         LEFT JOIN public.profiles profile ON profile.user_id=session.scanned_user_id
        WHERE session.id=$1 AND session.staff_user_id=$2`, [req.params.id, req.user.id]
    );
    const session = result.rows[0];
    if (!session) return res.status(404).json({ error: "PAIRING_NOT_FOUND", message: "Scanner pairing was not found." });
    if (session.status === "closed" || new Date(session.expires_at).getTime() <= Date.now()) return res.status(410).json({ error: "PAIRING_EXPIRED", message: "Scanner pairing expired." });
    if (session.status !== "scanned" || !session.scanned_user_id) return res.json({ status: session.status, expiresAt: session.expires_at });
    if (!session.is_active) return res.status(404).json({ error: "ACCOUNT_INACTIVE", message: "The scanned account is inactive." });
    if (session.scan_mode === "return") {
      const requests = await findBorrowedRequests(session.scanned_user_id);
      return res.json({ mode: "return", borrower: { fullName: session.full_name, studentId: session.student_id, role: session.role }, requests });
    }
    const request = await findReadyRequest(session.scanned_user_id);
    return res.json(claimResponse({ user_id: session.scanned_user_id, full_name: session.full_name, student_id: session.student_id, role: session.role }, request, req.user.id));
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

module.exports = { closeScannerPairing, createScannerPairing, getMyQr, getPairingResult, joinScannerPairing, lookupReadyRequest, regenerateMyQr, submitPairedScan };
