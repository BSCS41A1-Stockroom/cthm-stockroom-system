"use strict";

const pool = require("../config/db");
const { isValidDate } = require("../algorithms/borrowingValidation");
const { datesBetween, lockClosureDates, suggestClosure } = require("../utils/calendarClosures");
const { writeAuditLog } = require("../utils/auditLog");
const { notifyUser } = require("../utils/notifications");

async function listClosures(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT closure.id, closure.title, closure.start_date, closure.end_date,
              closure.department_id, closure.source_kind, closure.source_url, closure.source_key,
              closure.is_active, department.name AS department_name
         FROM public.calendar_closures closure
         LEFT JOIN public.academic_departments department ON department.id=closure.department_id
        WHERE closure.is_active=true
          AND ($1::boolean=false OR closure.department_id IS NULL OR closure.department_id=$2::bigint)
        ORDER BY closure.start_date, closure.id`,
      [req.user.role !== "admin", req.user.department_id]
    );
    return res.json({ closures: result.rows });
  } catch (error) { return next(error); }
}

function suggestFromPost(req, res) {
  return res.json(suggestClosure(req.body?.text));
}

async function createClosure(req, res, next) {
  const title = String(req.body?.title || "").trim();
  const startDate = String(req.body?.startDate || "");
  const endDate = String(req.body?.endDate || startDate);
  const departmentId = req.body?.departmentId || null;
  const sourceUrl = String(req.body?.sourceUrl || "").trim();
  const sourceKind = req.body?.sourceKind === "official_holiday" ? "official_holiday" : "school_announcement";
  const dates = datesBetween(startDate, endDate);
  if (title.length < 3 || title.length > 160 || !isValidDate(startDate) || !isValidDate(endDate)
      || endDate < startDate || !dates.length || dates.at(-1) !== endDate
      || (departmentId && !/^[1-9]\d*$/.test(String(departmentId)))) {
    return res.status(422).json({ message: "Enter a title, valid date range of at most 31 days, and an optional valid department." });
  }
  if (sourceUrl && (!/^https:\/\//i.test(sourceUrl) || sourceUrl.length > 1000)) {
    return res.status(422).json({ message: "Source link must be a secure HTTPS URL." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockClosureDates(client, startDate, endDate);
    const result = await client.query(
      `INSERT INTO public.calendar_closures
        (title,start_date,end_date,department_id,source_kind,source_url,confirmed_by)
       VALUES ($1,$2::date,$3::date,$4::bigint,$5,$6,$7) RETURNING *`,
      [title, startDate, endDate, departmentId, sourceKind, sourceUrl || null, req.user.id]
    );
    const closure = result.rows[0];
    const impacted = await client.query(
      `SELECT id, user_id, assigned_professor_user_id, status FROM public.borrow_requests
        WHERE status IN ('Pending','Validated','Approved','Borrowed')
          AND (department_id=$1::bigint OR $1::bigint IS NULL)
          AND (borrow_date BETWEEN $2::date AND $3::date
            OR return_date BETWEEN $2::date AND $3::date)`,
      [departmentId, startDate, endDate]
    );
    for (const request of impacted.rows) {
      const message = request.status === "Borrowed"
        ? `The date of your active borrowing is affected by ${title}. Contact the stockroom about the return arrangement.`
        : `Your borrowing schedule is affected by ${title}. Contact your professor to arrange a new date; this request has not been moved automatically.`;
      await notifyUser(client, request.user_id, {
        type: "calendar_disruption", title: "Borrowing schedule affected", message,
        relatedPath: "/my-requests", entityType: "borrowing_request", entityId: request.id,
      });
      if (request.assigned_professor_user_id && request.status !== "Borrowed") {
        await notifyUser(client, request.assigned_professor_user_id, {
          type: "calendar_disruption", title: "Student schedule affected",
          message: `A borrowing request is affected by ${title}. Please coordinate a replacement date with the student.`,
          relatedPath: "/professor/requests", entityType: "borrowing_request", entityId: request.id,
        });
      }
    }
    await writeAuditLog(client, req.user, {
      action: "calendar_closure_confirmed", entityType: "calendar_closure", entityId: closure.id,
      newValues: closure,
    });
    await client.query("COMMIT");
    return res.status(201).json({ closure, affectedRequests: impacted.rowCount });
  } catch (error) { await client.query("ROLLBACK"); return next(error); }
  finally { client.release(); }
}

async function deactivateClosure(req, res, next) {
  if (!/^[1-9]\d*$/.test(String(req.params.id))) return res.status(400).json({ message: "Invalid closure ID." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT * FROM public.calendar_closures WHERE id=$1 FOR UPDATE", [req.params.id]);
    const closure = found.rows[0];
    if (!closure) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Closure not found." }); }
    await lockClosureDates(client, String(closure.start_date).slice(0, 10), String(closure.end_date).slice(0, 10));
    const result = await client.query("UPDATE public.calendar_closures SET is_active=false,updated_at=now() WHERE id=$1 RETURNING *", [closure.id]);
    await writeAuditLog(client, req.user, {
      action: "calendar_closure_deactivated", entityType: "calendar_closure", entityId: closure.id,
      oldValues: closure, newValues: result.rows[0],
    });
    await client.query("COMMIT");
    return res.json({ closure: result.rows[0] });
  } catch (error) { await client.query("ROLLBACK"); return next(error); }
  finally { client.release(); }
}

module.exports = { listClosures, suggestFromPost, createClosure, deactivateClosure };
