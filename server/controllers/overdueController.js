"use strict";

const crypto = require("node:crypto");
const pool = require("../config/db");
const { writeAuditLog } = require("../utils/auditLog");

function authorizedCronRequest(authorization, secret = process.env.CRON_SECRET) {
  if (!secret || typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice(7), "utf8");
  const expected = Buffer.from(secret, "utf8");
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

async function processOverdueBorrowings(databasePool = pool) {
  const client = await databasePool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query(
      "SELECT pg_try_advisory_xact_lock(hashtextextended('overdue-monitoring', 0)) AS acquired"
    );
    if (!lock.rows[0]?.acquired) {
      await client.query("ROLLBACK");
      return { processed: 0, notificationsCreated: 0, skipped: true };
    }

    const overdueResult = await client.query(
      `SELECT request.id, request.user_id, request.student_name,
              request.return_date::text AS return_date,
              request.overdue_detected_at,
              ((now() AT TIME ZONE 'Asia/Manila')::date - request.return_date)::integer AS days_overdue,
              (now() AT TIME ZONE 'Asia/Manila')::date::text AS notification_date
         FROM public.borrow_requests request
        WHERE request.status = 'Borrowed'
          AND request.return_date < (now() AT TIME ZONE 'Asia/Manila')::date
        ORDER BY request.id
        FOR UPDATE`
    );

    let notificationsCreated = 0;
    for (const request of overdueResult.rows) {
      const requestCode = `BR-${String(request.id).padStart(3, "0")}`;
      const dayLabel = `${request.days_overdue} day${request.days_overdue === 1 ? "" : "s"}`;

      if (request.user_id) {
        const studentNotice = await client.query(
          `INSERT INTO public.notifications
            (recipient_user_id, type, title, message, related_path, entity_type, entity_id, notification_key)
           VALUES ($1, 'borrowing_overdue', 'Borrowing return overdue', $2,
                   '/my-requests', 'borrowing_request', $3, $4)
           ON CONFLICT (notification_key) WHERE notification_key is not null DO NOTHING
           RETURNING id`,
          [request.user_id, `${requestCode} is ${dayLabel} overdue. Please return all outstanding items.`,
            String(request.id), `overdue:${request.id}:${request.notification_date}:student:${request.user_id}`]
        );
        notificationsCreated += studentNotice.rowCount;
      }

      const staffNotices = await client.query(
        `INSERT INTO public.notifications
          (recipient_user_id, type, title, message, related_path, entity_type, entity_id, notification_key)
         SELECT profile.user_id, 'borrowing_overdue', 'Overdue borrowing detected', $1,
                '/admin/requests', 'borrowing_request', $2,
                'overdue:' || $2 || ':' || $3 || ':staff:' || profile.user_id
           FROM public.profiles profile
          WHERE profile.role IN ('professor', 'admin') AND profile.is_active = true
         ON CONFLICT (notification_key) WHERE notification_key is not null DO NOTHING
         RETURNING id`,
        [`${requestCode} for ${request.student_name} is ${dayLabel} overdue.`, String(request.id), request.notification_date]
      );
      notificationsCreated += staffNotices.rowCount;

      if (!request.overdue_detected_at) {
        await writeAuditLog(client, null, {
          action: "borrowing_overdue_detected",
          entityType: "borrowing_request",
          entityId: request.id,
          newValues: { returnDate: request.return_date, daysOverdue: request.days_overdue },
          metadata: { source: "scheduled_job" },
        });
      }

      await client.query(
        `UPDATE public.borrow_requests
            SET overdue_detected_at = COALESCE(overdue_detected_at, now()),
                last_overdue_notified_on = (now() AT TIME ZONE 'Asia/Manila')::date,
                overdue_resolved_at = null,
                updated_at = now()
          WHERE id = $1`,
        [request.id]
      );
    }

    await client.query("COMMIT");
    return { processed: overdueResult.rowCount, notificationsCreated, skipped: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function processUpcomingDeadlines(databasePool = pool) {
  const client = await databasePool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query(
      "SELECT pg_try_advisory_xact_lock(hashtextextended('return-deadline-warnings', 0)) AS acquired"
    );
    if (!lock.rows[0]?.acquired) {
      await client.query("ROLLBACK");
      return { processed: 0, notificationsCreated: 0, skipped: true };
    }

    const upcomingResult = await client.query(
      `SELECT request.id, request.user_id, due.event_date::text AS due_date,
              (due.event_date - (now() AT TIME ZONE 'Asia/Manila')::date)::integer AS days_remaining,
              outstanding.units_outstanding
         FROM public.borrow_requests request
         JOIN public.calendar_events due
           ON due.borrow_request_id = request.id AND due.event_type = 'return_due'
         JOIN LATERAL (
           SELECT COALESCE(SUM(items.quantity - COALESCE(returned.accounted, 0)), 0)::integer AS units_outstanding
             FROM public.borrow_request_items items
             LEFT JOIN (
               SELECT request_id, inventory_id,
                      SUM(good_quantity + damaged_quantity + missing_quantity)::integer AS accounted
                 FROM public.borrowing_return_items
                GROUP BY request_id, inventory_id
             ) returned ON returned.request_id = items.request_id
                       AND returned.inventory_id = items.inventory_id
            WHERE items.request_id = request.id
         ) outstanding ON true
        WHERE request.status = 'Borrowed'
          AND request.user_id IS NOT NULL
          AND due.event_date BETWEEN (now() AT TIME ZONE 'Asia/Manila')::date
                                 AND (now() AT TIME ZONE 'Asia/Manila')::date + 3
          AND outstanding.units_outstanding > 0
        ORDER BY request.id
        FOR UPDATE OF request`
    );

    let notificationsCreated = 0;
    for (const request of upcomingResult.rows) {
      const requestCode = `BR-${String(request.id).padStart(3, "0")}`;
      const message = request.days_remaining === 0
        ? `${requestCode} is due today (${request.due_date}). ${request.units_outstanding} unit(s) remain outstanding.`
        : `${requestCode} is due in ${request.days_remaining} day(s) (${request.due_date}). ${request.units_outstanding} unit(s) remain outstanding.`;
      const notice = await client.query(
        `INSERT INTO public.notifications
          (recipient_user_id, type, title, message, related_path, entity_type, entity_id, notification_key)
         VALUES ($1, 'borrowing_due_soon', $2, $3, '/my-requests',
                 'borrowing_request', $4, $5)
         ON CONFLICT (notification_key) WHERE notification_key IS NOT NULL DO NOTHING
         RETURNING id`,
        [request.user_id, request.days_remaining === 0 ? "Borrowing due today" : "Borrowing return reminder",
          message, String(request.id), `return-due:${request.id}:${request.due_date}:${request.days_remaining}:${request.user_id}`]
      );
      notificationsCreated += notice.rowCount;
    }

    await client.query("COMMIT");
    return { processed: upcomingResult.rowCount, notificationsCreated, skipped: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function processExpiredClaims(databasePool = pool) {
  const client = await databasePool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query(
      "SELECT pg_try_advisory_xact_lock(hashtextextended('claim-expiration', 0)) AS acquired"
    );
    if (!lock.rows[0]?.acquired) {
      await client.query("ROLLBACK");
      return { processed: 0, notificationsCreated: 0, skipped: true };
    }
    const expired = await client.query(
      `SELECT id, user_id FROM public.borrow_requests
        WHERE status='Approved' AND return_date < (now() AT TIME ZONE 'Asia/Manila')::date
        ORDER BY id FOR UPDATE`
    );
    let notificationsCreated = 0;
    for (const request of expired.rows) {
      const items = await client.query(
        `SELECT inventory_id, quantity FROM public.borrow_request_items WHERE request_id=$1 ORDER BY inventory_id FOR UPDATE`, [request.id]
      );
      for (const item of items.rows) {
        const adjusted = await client.query(
          `UPDATE public.inventory SET reserved_quantity=reserved_quantity-$1, updated_at=now()
            WHERE id=$2 AND reserved_quantity >= $1 RETURNING id`, [item.quantity, item.inventory_id]
        );
        if (!adjusted.rowCount) throw new Error(`Inventory reservation is inconsistent for expired request '${request.id}'.`);
      }
      await client.query(`UPDATE public.borrow_requests SET status='Expired', updated_at=now() WHERE id=$1`, [request.id]);
      await client.query(`DELETE FROM public.calendar_events WHERE borrow_request_id=$1`, [request.id]);
      if (request.user_id) {
        const notice = await client.query(
          `INSERT INTO public.notifications
            (recipient_user_id, type, title, message, related_path, entity_type, entity_id, notification_key)
           VALUES ($1, 'borrowing_expired', 'Ready request expired', $2, '/my-requests', 'borrowing_request', $3, $4)
           ON CONFLICT (notification_key) WHERE notification_key IS NOT NULL DO NOTHING RETURNING id`,
          [request.user_id, `BR-${String(request.id).padStart(3, "0")} was not claimed before its return deadline. Its reservation has been released.`, String(request.id), `claim-expired:${request.id}:${request.user_id}`]
        );
        notificationsCreated += notice.rowCount;
      }
      await writeAuditLog(client, null, { action: "borrowing_claim_expired", entityType: "borrowing_request", entityId: request.id, oldValues: { status: "Approved" }, newValues: { status: "Expired" }, metadata: { source: "scheduled_job" } });
    }
    await client.query("COMMIT");
    return { processed: expired.rowCount, notificationsCreated, skipped: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

async function runOverdueMonitoring(req, res, next) {
  if (!authorizedCronRequest(req.get("authorization"))) {
    return res.status(401).json({ error: "INVALID_CRON_AUTHORIZATION", message: "Scheduled job authorization is invalid." });
  }
  try {
    const expiredClaims = await processExpiredClaims();
    const upcoming = await processUpcomingDeadlines();
    const overdue = await processOverdueBorrowings();
    return res.json({ expiredClaims, upcoming, overdue });
  } catch (error) {
    return next(error);
  }
}

module.exports = { authorizedCronRequest, processExpiredClaims, processUpcomingDeadlines, processOverdueBorrowings, runOverdueMonitoring };
