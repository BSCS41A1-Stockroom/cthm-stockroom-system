"use strict";

function usableInventoryQuantity(item) {
  return Number(item.quantity ?? 0) + Number(item.additional_qty ?? 0)
    - Number(item.replaces ?? 0) - Number(item.missing ?? 0)
    - Number(item.breakage ?? 0) - Number(item.defective ?? 0)
    - Number(item.total_loss ?? 0);
}

async function loadInventoryCommitment(client, inventoryId, excludeRequestId = null) {
  const result = await client.query(
    `WITH returned AS (
       SELECT request_id, inventory_id,
              SUM(good_quantity + damaged_quantity + missing_quantity)::bigint AS accounted
         FROM public.borrowing_return_items
        WHERE inventory_id = $1
        GROUP BY request_id, inventory_id
     ), commitments AS (
       SELECT request.id, request.status, request.borrow_date, request.return_date,
              COALESCE(returned.accounted, 0)::bigint AS accounted,
              item.quantity::bigint AS requested_quantity,
              CASE WHEN request.status = 'Borrowed'
                THEN GREATEST(item.quantity - COALESCE(returned.accounted, 0), 0)
                ELSE item.quantity END::bigint AS quantity
         FROM public.borrow_request_items item
         JOIN public.borrow_requests request ON request.id = item.request_id
         LEFT JOIN returned ON returned.request_id = item.request_id AND returned.inventory_id = item.inventory_id
        WHERE item.inventory_id = $1
          AND ($2::bigint IS NULL OR request.id <> $2::bigint)
          AND request.status IN ('Pending', 'Validated', 'Approved', 'Borrowed')
     ), candidate_dates AS (
       SELECT DISTINCT borrow_date AS date FROM commitments WHERE status <> 'Borrowed'
     )
     SELECT
       COALESCE((SELECT SUM(quantity) FROM commitments WHERE status = 'Borrowed'), 0)::bigint AS borrowed,
       COALESCE((SELECT MAX((SELECT COALESCE(SUM(quantity), 0) FROM commitments active
         WHERE active.status <> 'Borrowed' AND active.borrow_date <= candidate.date
           AND active.return_date >= candidate.date)) FROM candidate_dates candidate), 0)::bigint AS scheduled_peak,
       COALESCE((SELECT bool_or(quantity < 0 OR requested_quantity <= 0
         OR accounted < 0 OR accounted > requested_quantity) FROM commitments), false) AS has_invalid_quantity`,
    [inventoryId, excludeRequestId]
  );
  const row = result.rows[0] ?? {};
  const borrowed = Number(row.borrowed ?? 0);
  const scheduledPeak = Number(row.scheduled_peak ?? 0);
  const valid = Number.isSafeInteger(borrowed) && borrowed >= 0
    && Number.isSafeInteger(scheduledPeak) && scheduledPeak >= 0
    && row.has_invalid_quantity !== true;
  return Object.freeze({
    borrowed,
    scheduledPeak,
    requiredCapacity: valid ? borrowed + scheduledPeak : Number.NaN,
    valid,
  });
}

module.exports = { loadInventoryCommitment, usableInventoryQuantity };
