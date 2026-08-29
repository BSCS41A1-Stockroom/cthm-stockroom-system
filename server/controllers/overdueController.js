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

async function runOverdueMonitoring(req, res, next) {
  if (!authorizedCronRequest(req.get("authorization"))) {
    return res.status(401).json({ error: "INVALID_CRON_AUTHORIZATION", message: "Scheduled job authorization is invalid." });
  }
  try {
    return res.json(await processOverdueBorrowings());
  } catch (error) {
    return next(error);
  }
}

module.exports = { authorizedCronRequest, processOverdueBorrowings, runOverdueMonitoring };
