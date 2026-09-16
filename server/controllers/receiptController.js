"use strict";

const pool = require("../config/db");
const ID = /^[1-9]\d*$/;
const CODE = /^[0-9a-f]{32}$/;

async function listRequestReceipts(req, res, next) {
  if (!ID.test(req.params.id)) return res.status(400).json({ error: "INVALID_REQUEST_ID", message: "Borrowing request ID is invalid." });
  try {
    const allowed = await pool.query(`SELECT id FROM public.borrow_requests WHERE id=$1 AND ($2::text IN ('admin','professor') OR user_id=$3::uuid)`, [req.params.id, req.user.role, req.user.id]);
    if (!allowed.rowCount) return res.status(404).json({ error: "REQUEST_NOT_FOUND", message: "Borrowing request was not found." });
    const result = await pool.query(`SELECT id,receipt_number,verification_code,receipt_type,request_id,return_id,snapshot,created_at FROM public.transaction_receipts WHERE request_id=$1 ORDER BY created_at,id`, [req.params.id]);
    return res.json({ receipts: result.rows });
  } catch (error) { return next(error); }
}

async function verifyReceipt(req, res, next) {
  const code = String(req.params.code || "").toLowerCase();
  if (!CODE.test(code)) return res.status(400).json({ valid: false, message: "Receipt verification code is invalid." });
  try {
    const result = await pool.query(`SELECT receipt_number,receipt_type,request_id,created_at FROM public.transaction_receipts WHERE verification_code=$1`, [code]);
    if (!result.rowCount) return res.status(404).json({ valid: false, message: "No authentic receipt matches this verification code." });
    return res.json({ valid: true, receipt: result.rows[0] });
  } catch (error) { return next(error); }
}

module.exports = { listRequestReceipts, verifyReceipt };
