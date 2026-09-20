"use strict";

const pool = require("../config/db");
const { isValidDate } = require("../algorithms/borrowingValidation");

const REPORT_MAX_DAYS = 366 * 5;

function dateString(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeReportRange(query = {}, now = new Date()) {
  const today = dateString(now);
  const from = query.from || `${today.slice(0, 4)}-01-01`;
  const to = query.to || today;
  const errors = [];

  if (!isValidDate(from)) errors.push("A valid from date is required.");
  if (!isValidDate(to)) errors.push("A valid to date is required.");
  if (isValidDate(from) && isValidDate(to)) {
    if (from > to) errors.push("The from date cannot be after the to date.");
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    if (days > REPORT_MAX_DAYS) errors.push("The report range cannot exceed five years.");
  }

  return { from, to, errors };
}

function number(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function reportSummary(req, res, next) {
  const range = normalizeReportRange(req.query);
  if (range.errors.length) {
    return res.status(422).json({ error: "INVALID_REPORT_RANGE", reasons: range.errors });
  }

  const parameters = [range.from, range.to, ["staff", "department_head"].includes(req.user?.role) ? req.user.department_id : null];
  try {
    const [summaryResult, statusResult, monthlyResult, itemsResult, recentResult, upcomingResult] = await Promise.all([
      pool.query(
        `WITH ranged_requests AS (
           SELECT * FROM borrow_requests
            WHERE borrow_date BETWEEN $1::date AND $2::date AND ($3::bigint IS NULL OR department_id=$3)
         ), ranged_items AS (
           SELECT items.*, requests.status, requests.student_id
             FROM borrow_request_items items
             JOIN ranged_requests requests ON requests.id = items.request_id
         ), ranged_return_items AS (
           SELECT return_items.*
             FROM borrowing_return_items return_items
             JOIN ranged_requests requests ON requests.id = return_items.request_id
         ), inventory_totals AS (
           SELECT COALESCE(SUM(GREATEST(0,
             COALESCE(quantity, 0) + COALESCE(additional_qty, 0) - COALESCE(replaces, 0)
             - COALESCE(missing, 0) - COALESCE(breakage, 0) - COALESCE(defective, 0)
             - COALESCE(total_loss, 0) - COALESCE(reserved_quantity, 0) - COALESCE(borrowed_quantity, 0)
           )), 0) AS available_units FROM inventory
           LEFT JOIN laboratory_rooms room ON room.id=inventory.room_id
           WHERE ($3::bigint IS NULL OR room.department_id=$3)
         )
         SELECT
           COUNT(*) AS total_borrowings,
           (SELECT COUNT(*) FROM public.borrow_requests WHERE status IN ('Pending', 'Validated') AND ($3::bigint IS NULL OR department_id=$3)) AS pending_requests,
           COUNT(*) FILTER (WHERE status = 'Approved') AS approved_requests,
           COUNT(*) FILTER (WHERE status = 'Borrowed') AS borrowed_requests,
           COUNT(*) FILTER (WHERE status = 'Returned') AS returned_requests,
           COUNT(*) FILTER (WHERE status = 'Rejected') AS rejected_requests,
           COUNT(DISTINCT lower(trim(student_id))) FILTER
             (WHERE status IN ('Pending', 'Validated', 'Approved', 'Borrowed')) AS active_borrowers,
           COALESCE((SELECT SUM(quantity) FROM ranged_items WHERE status = 'Borrowed'), 0) AS borrowed_units,
           COALESCE((SELECT SUM(good_quantity + damaged_quantity) FROM ranged_return_items), 0) AS returned_units,
           (SELECT available_units FROM inventory_totals) AS available_inventory_units,
           (SELECT COUNT(*) FROM asset_maintenance_records maintenance JOIN inventory maintained ON maintained.id=maintenance.inventory_id JOIN laboratory_rooms room ON room.id=maintained.room_id WHERE maintenance.status IN ('under_inspection','under_repair') AND ($3::bigint IS NULL OR room.department_id=$3)) AS open_maintenance_cases,
           (SELECT COUNT(*) FROM asset_maintenance_records maintenance JOIN inventory maintained ON maintained.id=maintenance.inventory_id JOIN laboratory_rooms room ON room.id=maintained.room_id WHERE maintenance.status IN ('under_inspection','under_repair') AND maintenance.due_date < (now() AT TIME ZONE 'Asia/Manila')::date AND ($3::bigint IS NULL OR room.department_id=$3)) AS overdue_maintenance_cases,
           (SELECT COALESCE(SUM(maintenance.cost),0) FROM asset_maintenance_records maintenance JOIN inventory maintained ON maintained.id=maintenance.inventory_id JOIN laboratory_rooms room ON room.id=maintained.room_id WHERE (maintenance.opened_at AT TIME ZONE 'Asia/Manila')::date BETWEEN $1::date AND $2::date AND ($3::bigint IS NULL OR room.department_id=$3)) AS maintenance_cost,
           (SELECT COUNT(*) FROM inventory_assets asset JOIN inventory stocked ON stocked.id=asset.inventory_id JOIN laboratory_rooms room ON room.id=stocked.room_id WHERE asset.inspection_interval_days IS NOT NULL AND asset.status<>'retired' AND ($3::bigint IS NULL OR room.department_id=$3)) AS scheduled_inspection_assets,
           (SELECT COUNT(*) FROM inventory_assets asset JOIN inventory stocked ON stocked.id=asset.inventory_id JOIN laboratory_rooms room ON room.id=stocked.room_id WHERE asset.status='available' AND asset.next_inspection_date IS NOT NULL AND asset.next_inspection_date <= (now() AT TIME ZONE 'Asia/Manila')::date AND ($3::bigint IS NULL OR room.department_id=$3)) AS overdue_inspection_assets,
           (SELECT COUNT(*) FROM transaction_receipts receipt JOIN borrow_requests request ON request.id=receipt.request_id WHERE (receipt.created_at AT TIME ZONE 'Asia/Manila')::date BETWEEN $1::date AND $2::date AND ($3::bigint IS NULL OR request.department_id=$3)) AS receipts_generated,
           (SELECT COUNT(*) FROM transaction_receipts receipt JOIN borrow_requests request ON request.id=receipt.request_id WHERE receipt.receipt_type = 'claim' AND (receipt.created_at AT TIME ZONE 'Asia/Manila')::date BETWEEN $1::date AND $2::date AND ($3::bigint IS NULL OR request.department_id=$3)) AS claim_receipts,
           (SELECT COUNT(*) FROM transaction_receipts receipt JOIN borrow_requests request ON request.id=receipt.request_id WHERE receipt.receipt_type = 'return' AND (receipt.created_at AT TIME ZONE 'Asia/Manila')::date BETWEEN $1::date AND $2::date AND ($3::bigint IS NULL OR request.department_id=$3)) AS return_receipts,
           COALESCE((
             SELECT SUM(good_quantity + damaged_quantity + missing_quantity)
               FROM borrowing_return_items returned_items
              JOIN borrow_requests returned_request ON returned_request.id=returned_items.request_id
              WHERE (returned_items.created_at AT TIME ZONE 'Asia/Manila')::date
                    = (now() AT TIME ZONE 'Asia/Manila')::date
                AND ($3::bigint IS NULL OR returned_request.department_id=$3)
           ), 0) AS returned_today
         FROM ranged_requests`,
        parameters
      ),
      pool.query(
        `SELECT status, COUNT(*) AS value
           FROM borrow_requests
          WHERE borrow_date BETWEEN $1::date AND $2::date AND ($3::bigint IS NULL OR department_id=$3)
          GROUP BY status ORDER BY status`,
        parameters
      ),
      pool.query(
        `WITH months AS (
           SELECT generate_series(
             date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month'
           )::date AS month
         )
         SELECT to_char(months.month, 'YYYY-MM') AS month,
                COUNT(requests.id) AS borrowings,
                COUNT(requests.id) FILTER (WHERE requests.status = 'Approved') AS approved,
                COUNT(requests.id) FILTER (WHERE requests.status = 'Returned') AS returned
           FROM months
           LEFT JOIN borrow_requests requests
             ON date_trunc('month', requests.borrow_date) = months.month
            AND requests.borrow_date BETWEEN $1::date AND $2::date
            AND ($3::bigint IS NULL OR requests.department_id=$3)
          GROUP BY months.month ORDER BY months.month`,
        parameters
      ),
      pool.query(
        `SELECT inventory.id, inventory.item_name,
                COALESCE(SUM(items.quantity), 0) AS borrowed
           FROM borrow_request_items items
           JOIN borrow_requests requests ON requests.id = items.request_id
           JOIN inventory ON inventory.id = items.inventory_id
          WHERE requests.borrow_date BETWEEN $1::date AND $2::date
            AND ($3::bigint IS NULL OR requests.department_id=$3)
            AND requests.status IN ('Borrowed', 'Returned')
          GROUP BY inventory.id, inventory.item_name
          ORDER BY borrowed DESC, inventory.item_name
          LIMIT 10`,
        parameters
      ),
      pool.query(
        `SELECT requests.id, requests.student_name, requests.borrow_date,
                requests.status,
                COALESCE(string_agg(inventory.item_name, ', ' ORDER BY inventory.item_name), 'No items') AS items
           FROM borrow_requests requests
           LEFT JOIN borrow_request_items request_items ON request_items.request_id = requests.id
           LEFT JOIN inventory ON inventory.id = request_items.inventory_id
          WHERE requests.borrow_date BETWEEN $1::date AND $2::date
            AND ($3::bigint IS NULL OR requests.department_id=$3)
          GROUP BY requests.id
          ORDER BY requests.created_at DESC, requests.id DESC
          LIMIT 5`,
        parameters
      ),
      pool.query(
        `SELECT requests.id, requests.borrow_date, requests.purpose,
                COALESCE(SUM(items.quantity), 0) AS units
          FROM borrow_requests requests
          LEFT JOIN borrow_request_items items ON items.request_id = requests.id
          WHERE requests.borrow_date >= (now() AT TIME ZONE 'Asia/Manila')::date
            AND ($1::bigint IS NULL OR requests.department_id = $1)
            AND requests.status IN ('Approved', 'Borrowed')
        GROUP BY requests.id
        ORDER BY requests.borrow_date, requests.id
        LIMIT 5`,
        [["staff", "department_head"].includes(req.user?.role) ? req.user.department_id : null]
      ),
    ]);

    const summaryRow = summaryResult.rows[0] || {};
    return res.json({
      range: { from: range.from, to: range.to },
      summary: Object.fromEntries(Object.entries(summaryRow).map(([key, value]) => [key, number(value)])),
      statuses: statusResult.rows.map((row) => ({ name: row.status, value: number(row.value) })),
      monthly: monthlyResult.rows.map((row) => ({
        month: row.month,
        borrowings: number(row.borrowings),
        approved: number(row.approved),
        returned: number(row.returned),
      })),
      mostBorrowed: itemsResult.rows.map((row) => ({ id: row.id, item: row.item_name, borrowed: number(row.borrowed) })),
      recentRequests: recentResult.rows,
      upcomingBorrowings: upcomingResult.rows.map((row) => ({ ...row, units: number(row.units) })),
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { normalizeReportRange, reportSummary };
