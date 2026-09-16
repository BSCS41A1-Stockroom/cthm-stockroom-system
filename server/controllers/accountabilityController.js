"use strict";

const pool = require("../config/db");
const { writeAuditLog } = require("../utils/auditLog");
const { notifyUser } = require("../utils/notifications");

const ID = /^[1-9]\d*$/;
const FINAL_STATUSES = new Set(["resolved", "waived"]);
const RESOLUTIONS = new Set(["repaired", "replaced", "recovered", "returned", "payment_recorded", "waived"]);
const RESOLUTIONS_BY_INCIDENT = Object.freeze({
  damaged: new Set(["repaired", "replaced", "payment_recorded", "waived"]),
  missing: new Set(["recovered", "replaced", "payment_recorded", "waived"]),
  overdue: new Set(["returned", "waived"]),
});

function normalizeResolution(body = {}) {
  return {
    status: String(body.status || "").trim().toLowerCase(),
    resolutionType: String(body.resolutionType ?? body.resolution_type ?? "").trim().toLowerCase(),
    resolutionNote: String(body.resolutionNote ?? body.resolution_note ?? "").trim(),
    amount: body.amount === "" || body.amount == null ? null : Number(body.amount),
    confirmPayment: body.confirmPayment === true,
  };
}

function resolutionErrors(input) {
  const errors = [];
  if (!["under_review", "resolved", "waived"].includes(input.status)) errors.push("Select a valid case status.");
  if (FINAL_STATUSES.has(input.status)) {
    if (!RESOLUTIONS.has(input.resolutionType)) errors.push("Select how the case was resolved.");
    if (input.resolutionNote.length < 5 || input.resolutionNote.length > 1000) errors.push("Resolution notes must contain 5 to 1000 characters.");
    if ((input.status === "waived") !== (input.resolutionType === "waived")) errors.push("Waived cases must use the waived resolution.");
    if (input.resolutionType === "payment_recorded" && (!Number.isFinite(input.amount) || input.amount < 0 || !input.confirmPayment)) errors.push("Confirm the non-negative payment amount before recording it.");
  } else if (input.resolutionType || input.resolutionNote || input.amount != null) errors.push("Resolution details can only be recorded when closing a case.");
  return errors;
}

async function listCases(req, res, next) {
  try {
    const studentOnly = req.user.role === "student";
    const result = await pool.query(
      `SELECT accountability.id,accountability.case_number,accountability.request_id,accountability.return_id,
              accountability.incident_type,accountability.affected_quantity,accountability.description,
              accountability.evidence_notes,accountability.status,accountability.resolution_type,
              accountability.resolution_note,accountability.amount,accountability.created_at,
              accountability.updated_at,accountability.resolved_at,inventory.item_name,
              request.student_name,request.student_id
         FROM public.accountability_cases accountability
         JOIN public.inventory inventory ON inventory.id=accountability.inventory_id
         JOIN public.borrow_requests request ON request.id=accountability.request_id
        WHERE (NOT $1::boolean OR accountability.user_id=$2::uuid)
        ORDER BY CASE WHEN accountability.status IN ('open','under_review') THEN 0 ELSE 1 END,
                 accountability.created_at DESC,accountability.id DESC`,
      [studentOnly, req.user.id]
    );
    return res.json({ cases: result.rows });
  } catch (error) { return next(error); }
}

async function updateCase(req, res, next) {
  if (!ID.test(req.params.id)) return res.status(400).json({ error: "INVALID_CASE_ID", message: "Accountability case ID is invalid." });
  const input = normalizeResolution(req.body);
  const errors = resolutionErrors(input);
  if (errors.length) return res.status(422).json({ error: "INVALID_CASE_UPDATE", reasons: errors });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT * FROM public.accountability_cases WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!current.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "CASE_NOT_FOUND", message: "Accountability case was not found." }); }
    if (FINAL_STATUSES.has(current.rows[0].status)) { await client.query("ROLLBACK"); return res.status(409).json({ error: "CASE_ALREADY_CLOSED", message: "This case is already closed and cannot be changed." }); }
    const closing = FINAL_STATUSES.has(input.status);
    if (closing && !RESOLUTIONS_BY_INCIDENT[current.rows[0].incident_type]?.has(input.resolutionType)) {
      await client.query("ROLLBACK");
      return res.status(422).json({ error: "INVALID_CASE_RESOLUTION", reasons: ["The selected resolution does not apply to this incident type."] });
    }
    const updated = await client.query(
      `UPDATE public.accountability_cases SET status=$2,resolution_type=$3,resolution_note=$4,amount=$5,
              resolved_by=CASE WHEN $6 THEN $7 ELSE NULL END,resolved_at=CASE WHEN $6 THEN now() ELSE NULL END,updated_at=now()
        WHERE id=$1 RETURNING *`,
      [req.params.id,input.status,closing ? input.resolutionType : null,closing ? input.resolutionNote : null,closing && input.resolutionType === "payment_recorded" ? input.amount : null,closing,req.user.id]
    );
    await writeAuditLog(client,req.user,{ action: closing ? "accountability_case_closed" : "accountability_case_review_started",entityType:"accountability_case",entityId:req.params.id,oldValues:{status:current.rows[0].status},newValues:{status:input.status,resolutionType:closing ? input.resolutionType : null,resolutionNote:closing ? input.resolutionNote : null,amount:closing && input.resolutionType === "payment_recorded" ? input.amount : null} });
    await notifyUser(client,current.rows[0].user_id,{ type: closing ? "accountability_resolved" : "accountability_under_review",title:closing ? "Accountability case closed" : "Accountability case under review",message:closing ? `${current.rows[0].case_number} has been ${input.status}. You may borrow again if no other open cases remain.` : `${current.rows[0].case_number} is now being reviewed by the stockroom.`,relatedPath:"/my-accountability",entityType:"accountability_case",entityId:req.params.id });
    await client.query("COMMIT");
    return res.json({ case: updated.rows[0] });
  } catch (error) { await client.query("ROLLBACK"); return next(error); }
  finally { client.release(); }
}

module.exports = { listCases, normalizeResolution, resolutionErrors, updateCase };
