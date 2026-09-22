"use strict";

const { createHash } = require("node:crypto");
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

async function listAnnouncementReviews(_req, res, next) {
  try {
    const result = await pool.query(
      `SELECT review.*, profile.full_name AS submitted_by_name, closure.title AS closure_title
         FROM public.announcement_reviews review
         LEFT JOIN public.profiles profile ON profile.user_id=review.submitted_by
         LEFT JOIN public.calendar_closures closure ON closure.id=review.closure_id
        ORDER BY (review.status='pending') DESC, review.created_at DESC, review.id DESC LIMIT 100`
    );
    return res.json({ reviews: result.rows.map((review) => {
      if (review.status !== "pending") return review;
      const analysis = suggestClosure(review.caption);
      return { ...review, possible_suspension: analysis.possibleSuspension,
        suspension_scope: analysis.scope,
        suggested_start_date: analysis.scope === "full_day" ? analysis.dates[0] || null : null,
        suggested_end_date: analysis.scope === "full_day" ? analysis.dates.at(-1) || null : null,
        evidence: { ...analysis.evidence, dates: analysis.dates }, warnings: analysis.warnings };
    }) });
  } catch (error) { return next(error); }
}

async function submitAnnouncementReview(req, res, next) {
  const caption = String(req.body?.caption || "").trim();
  const sourceUrl = String(req.body?.sourceUrl || "").trim();
  if (caption.length < 10 || caption.length > 10000
      || (sourceUrl && (!/^https:\/\//i.test(sourceUrl) || sourceUrl.length > 1000))) {
    return res.status(422).json({ message: "Provide the announcement caption and an optional secure source link." });
  }
  const suggestion = suggestClosure(caption);
  const fingerprint = createHash("sha256").update(`${sourceUrl.toLowerCase()}\n${caption.replace(/\s+/g, " ").toLowerCase()}`).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO public.announcement_reviews
        (caption,source_url,source_fingerprint,possible_suspension,suggested_start_date,suggested_end_date,warnings,submitted_by,suspension_scope,evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb)
       ON CONFLICT (source_fingerprint) WHERE status IN ('pending','confirmed') DO NOTHING
       RETURNING *`,
      [caption, sourceUrl || null, fingerprint, suggestion.possibleSuspension,
        suggestion.scope === "full_day" ? suggestion.dates[0] || null : null,
        suggestion.scope === "full_day" ? suggestion.dates.at(-1) || null : null,
        JSON.stringify(suggestion.warnings), req.user.id, suggestion.scope,
        JSON.stringify({ ...suggestion.evidence, dates: suggestion.dates })]
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "This announcement is already in the review queue or has been confirmed." });
    }
    await writeAuditLog(client, req.user, {
      action: "announcement_submitted_for_review", entityType: "announcement_review",
      entityId: result.rows[0].id, newValues: { sourceUrl: sourceUrl || null, possibleSuspension: suggestion.possibleSuspension },
    });
    await client.query("COMMIT");
    return res.status(201).json({ review: result.rows[0], suggestion });
  } catch (error) { await client.query("ROLLBACK"); return next(error); }
  finally { client.release(); }
}

async function createClosure(req, res, next) {
  const title = String(req.body?.title || "").trim();
  const startDate = String(req.body?.startDate || "");
  const endDate = String(req.body?.endDate || startDate);
  const departmentId = req.body?.departmentId || null;
  const sourceUrl = String(req.body?.sourceUrl || "").trim();
  const sourceKind = req.body?.sourceKind === "official_holiday" ? "official_holiday" : "school_announcement";
  const reviewId = req.body?.reviewId;
  const dates = datesBetween(startDate, endDate);
  if (title.length < 3 || title.length > 160 || !isValidDate(startDate) || !isValidDate(endDate)
      || endDate < startDate || !dates.length || dates.at(-1) !== endDate
      || (departmentId && !/^[1-9]\d*$/.test(String(departmentId)))
      || (reviewId && !/^[1-9]\d*$/.test(String(reviewId)))
      || (sourceKind === "school_announcement" && !reviewId)) {
    return res.status(422).json({ message: "Enter a title, valid date range of at most 31 days, and an optional valid department." });
  }
  if (sourceUrl && (!/^https:\/\//i.test(sourceUrl) || sourceUrl.length > 1000)) {
    return res.status(422).json({ message: "Source link must be a secure HTTPS URL." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (reviewId) {
      const reviewResult = await client.query(
        "SELECT * FROM public.announcement_reviews WHERE id=$1 FOR UPDATE", [reviewId]
      );
      const review = reviewResult.rows[0];
      if (!review || review.status !== "pending" || sourceKind !== "school_announcement") {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "This announcement is no longer awaiting review." });
      }
      const currentAnalysis = suggestClosure(review.caption);
      if (!currentAnalysis.possibleSuspension || currentAnalysis.scope !== "full_day") {
        await client.query("ROLLBACK");
        return res.status(422).json({ message: "This post is not a full-day class suspension. It cannot block an entire calendar date." });
      }
      if (sourceUrl !== (review.source_url || "")) {
        await client.query("ROLLBACK");
        return res.status(422).json({ message: "The source link must match the reviewed announcement." });
      }
    }
    await lockClosureDates(client, startDate, endDate);
    const result = await client.query(
      `INSERT INTO public.calendar_closures
        (title,start_date,end_date,department_id,source_kind,source_url,confirmed_by)
       VALUES ($1,$2::date,$3::date,$4::bigint,$5,$6,$7) RETURNING *`,
      [title, startDate, endDate, departmentId, sourceKind, sourceUrl || null, req.user.id]
    );
    const closure = result.rows[0];
    if (reviewId) await client.query(
      `UPDATE public.announcement_reviews SET status='confirmed',reviewed_by=$2,reviewed_at=now(),closure_id=$3
        WHERE id=$1`, [reviewId, req.user.id, closure.id]
    );
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

async function dismissAnnouncementReview(req, res, next) {
  if (!/^[1-9]\d*$/.test(String(req.params.id))) return res.status(400).json({ message: "Invalid review ID." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE public.announcement_reviews SET status='dismissed',reviewed_by=$2,reviewed_at=now()
        WHERE id=$1 AND status='pending' RETURNING *`, [req.params.id, req.user.id]
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Announcement is no longer pending review." });
    }
    await writeAuditLog(client, req.user, {
      action: "announcement_dismissed", entityType: "announcement_review",
      entityId: result.rows[0].id, newValues: { status: "dismissed" },
    });
    await client.query("COMMIT");
    return res.json({ review: result.rows[0] });
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

module.exports = { listClosures, suggestFromPost, createClosure, deactivateClosure,
  listAnnouncementReviews, submitAnnouncementReview, dismissAnnouncementReview };
