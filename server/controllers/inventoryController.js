"use strict";

const pool = require("../config/db");
const { isValidDate } = require("../algorithms/borrowingValidation");
const { ACTIVE_BORROWING_STATUSES } = require("../algorithms/conflictDetection");

function normalizeUnavailability(body = {}) {
  return {
    startDate: body.startDate ?? body.start_date,
    endDate: body.endDate ?? body.end_date,
    reason: typeof body.reason === "string" ? body.reason.trim() : "",
  };
}

function unavailabilityErrors(period) {
  const errors = [];
  if (!isValidDate(period.startDate)) errors.push("A valid start date is required.");
  if (!isValidDate(period.endDate)) errors.push("A valid end date is required.");
  if (isValidDate(period.startDate) && isValidDate(period.endDate) && period.startDate > period.endDate) {
    errors.push("The end date cannot be before the start date.");
  }
  if (!period.reason) errors.push("A reason is required.");
  return errors;
}

async function listUnavailability(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, inventory_id, start_date, end_date, reason, created_at, updated_at
         FROM inventory_unavailability
        WHERE inventory_id = $1
        ORDER BY start_date, end_date, id`,
      [req.params.inventoryId]
    );
    return res.json({ periods: result.rows });
  } catch (error) {
    return next(error);
  }
}

async function saveUnavailability(req, res, next) {
  const period = normalizeUnavailability(req.body);
  const errors = unavailabilityErrors(period);
  if (errors.length) {
    return res.status(422).json({ error: "INVALID_UNAVAILABILITY_PERIOD", reasons: errors });
  }

  const periodId = req.params.periodId ?? null;
  const inventoryId = req.params.inventoryId;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const inventoryResult = await client.query(
      `SELECT id FROM inventory WHERE id = $1 FOR UPDATE`,
      [inventoryId]
    );
    if (inventoryResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "INVENTORY_NOT_FOUND", message: "Inventory item was not found." });
    }

    if (periodId) {
      const currentResult = await client.query(
        `SELECT id FROM inventory_unavailability
          WHERE id = $1 AND inventory_id = $2 FOR UPDATE`,
        [periodId, inventoryId]
      );
      if (currentResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "PERIOD_NOT_FOUND", message: "Unavailability period was not found." });
      }
    }

    const overlapResult = await client.query(
      `SELECT id FROM inventory_unavailability
        WHERE inventory_id = $1
          AND start_date <= $2::date
          AND end_date >= $3::date
          AND ($4::bigint IS NULL OR id <> $4::bigint)
        FOR UPDATE`,
      [inventoryId, period.endDate, period.startDate, periodId]
    );
    if (overlapResult.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "UNAVAILABILITY_PERIOD_OVERLAP",
        message: "This item already has an unavailable period that overlaps those dates.",
      });
    }

    const activeBorrowingResult = await client.query(
      `SELECT requests.id
         FROM borrow_requests requests
         JOIN borrow_request_items items ON items.request_id = requests.id
        WHERE items.inventory_id = $1
          AND requests.status = ANY($2::text[])
          AND requests.borrow_date <= $3::date
          AND requests.return_date >= $4::date
        LIMIT 1
        FOR UPDATE OF requests`,
      [inventoryId, ACTIVE_BORROWING_STATUSES, period.endDate, period.startDate]
    );
    if (activeBorrowingResult.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "ACTIVE_BORROWING_DURING_UNAVAILABILITY",
        message: "An active borrowing request already uses this item during those dates. Resolve that request first.",
      });
    }

    const result = periodId
      ? await client.query(
        `UPDATE inventory_unavailability
            SET start_date = $2::date, end_date = $3::date, reason = $4,
                updated_at = now()
          WHERE id = $5 AND inventory_id = $1
        RETURNING *`,
        [inventoryId, period.startDate, period.endDate, period.reason, periodId]
      )
      : await client.query(
        `INSERT INTO inventory_unavailability
          (inventory_id, start_date, end_date, reason, created_by)
         VALUES ($1, $2::date, $3::date, $4, $5)
         RETURNING *`,
        [inventoryId, period.startDate, period.endDate, period.reason, req.user.id]
      );

    await client.query("COMMIT");
    return res.status(periodId ? 200 : 201).json({ period: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

async function deleteUnavailability(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inventoryResult = await client.query(
      `SELECT id FROM inventory WHERE id = $1 FOR UPDATE`,
      [req.params.inventoryId]
    );
    if (inventoryResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "INVENTORY_NOT_FOUND", message: "Inventory item was not found." });
    }

    const periodResult = await client.query(
      `SELECT id, inventory_id FROM inventory_unavailability
        WHERE id = $1 AND inventory_id = $2 FOR UPDATE`,
      [req.params.periodId, req.params.inventoryId]
    );
    if (periodResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "PERIOD_NOT_FOUND", message: "Unavailability period was not found." });
    }

    await client.query(`DELETE FROM inventory_unavailability WHERE id = $1`, [req.params.periodId]);
    await client.query("COMMIT");
    return res.status(204).end();
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  deleteUnavailability,
  listUnavailability,
  normalizeUnavailability,
  saveUnavailability,
  unavailabilityErrors,
};
