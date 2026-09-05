"use strict";

const pool = require("../config/db");
const { isValidDate } = require("../algorithms/borrowingValidation");
const { ACTIVE_BORROWING_STATUSES } = require("../algorithms/conflictDetection");
const { writeAuditLog } = require("../utils/auditLog");
const { loadInventoryCommitment, usableInventoryQuantity } = require("../utils/inventoryCommitments");

const INVENTORY_NUMBER_FIELDS = ["quantity", "additional_qty", "replaces", "missing", "breakage", "defective", "total_loss", "low_stock_threshold"];
const POSTGRES_INTEGER_MAX = 2_147_483_647;
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;

function normalizeInventory(body = {}) {
  const item = {
    item_name: typeof body.item_name === "string" ? body.item_name.trim() : "",
    purchase_date: body.purchase_date || null,
    remarks: typeof body.remarks === "string" ? body.remarks.trim() : "",
  };
  for (const field of INVENTORY_NUMBER_FIELDS) item[field] = Number(body[field] ?? 0);
  return item;
}

function inventoryErrors(item) {
  const errors = [];
  if (!item.item_name || item.item_name.length > 200) errors.push("Item name must contain between 1 and 200 characters.");
  if (item.purchase_date != null && !isValidDate(item.purchase_date)) errors.push("Purchase date must be a valid date.");
  if (item.remarks.length > 1000) errors.push("Remarks cannot exceed 1000 characters.");
  for (const field of INVENTORY_NUMBER_FIELDS) {
    if (!Number.isSafeInteger(item[field]) || item[field] < 0 || item[field] > POSTGRES_INTEGER_MAX) {
      errors.push(`${field} must be a non-negative database-safe whole number.`);
    }
  }
  const usable = usableInventoryQuantity(item);
  if (!Number.isSafeInteger(usable) || usable < 0) errors.push("Inventory deductions cannot exceed the total physical quantity.");
  return errors;
}

function validInventoryId(value) {
  const text = String(value ?? "");
  return /^[1-9]\d*$/.test(text) && BigInt(text) <= POSTGRES_BIGINT_MAX;
}

async function saveInventory(req, res, next) {
  const item = normalizeInventory(req.body);
  const errors = inventoryErrors(item);
  if (errors.length) return res.status(422).json({ error: "INVALID_INVENTORY", reasons: errors });
  const inventoryId = req.params.inventoryId ?? null;
  if (inventoryId != null && !validInventoryId(inventoryId)) return res.status(400).json({ error: "INVALID_INVENTORY_ID", message: "Inventory ID is invalid." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let previous = null;
    if (inventoryId != null) {
      const current = await client.query("SELECT * FROM public.inventory WHERE id = $1 FOR UPDATE", [inventoryId]);
      if (!current.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "INVENTORY_NOT_FOUND", message: "Inventory item was not found." }); }
      previous = current.rows[0];
      const commitment = await loadInventoryCommitment(client, inventoryId);
      if (!commitment.valid) { await client.query("ROLLBACK"); return res.status(409).json({ error: "INVALID_COMMITMENT_DATA", message: "Existing borrowing commitments are inconsistent. Inventory was not changed." }); }
      if (usableInventoryQuantity(item) < commitment.requiredCapacity) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "INVENTORY_COMMITMENT_CONFLICT", message: `Usable quantity cannot be lower than the ${commitment.requiredCapacity} unit(s) required by active borrowings.` });
      }
    }
    const values = [item.item_name, item.purchase_date, item.quantity, item.additional_qty, item.replaces,
      item.missing, item.breakage, item.defective, item.total_loss, item.low_stock_threshold, item.remarks];
    const result = inventoryId == null
      ? await client.query(`INSERT INTO public.inventory
          (item_name, purchase_date, quantity, additional_qty, replaces, missing, breakage, defective, total_loss, low_stock_threshold, remarks)
         VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`, values)
      : await client.query(`UPDATE public.inventory SET item_name=$1, purchase_date=$2::date, quantity=$3,
          additional_qty=$4, replaces=$5, missing=$6, breakage=$7, defective=$8, total_loss=$9,
          low_stock_threshold=$10, remarks=$11, updated_at=now() WHERE id=$12 RETURNING *`, [...values, inventoryId]);
    await writeAuditLog(client, req.user, {
      action: inventoryId == null ? "inventory_created" : "inventory_updated",
      entityType: "inventory", entityId: result.rows[0].id, oldValues: previous, newValues: result.rows[0],
    });
    await client.query("COMMIT");
    return res.status(inventoryId == null ? 201 : 200).json({ item: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ error: "INVENTORY_ALREADY_EXISTS", message: "An inventory item with the same unique value already exists." });
    return next(error);
  } finally { client.release(); }
}

async function deleteInventory(req, res, next) {
  if (!validInventoryId(req.params.inventoryId)) return res.status(400).json({ error: "INVALID_INVENTORY_ID", message: "Inventory ID is invalid." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT * FROM public.inventory WHERE id = $1 FOR UPDATE", [req.params.inventoryId]);
    if (!current.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "INVENTORY_NOT_FOUND", message: "Inventory item was not found." }); }
    const references = await client.query("SELECT 1 FROM public.borrow_request_items WHERE inventory_id = $1 LIMIT 1", [req.params.inventoryId]);
    if (references.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: "INVENTORY_HAS_HISTORY", message: "Items with borrowing history cannot be deleted. Mark the item unavailable instead." }); }
    await client.query("DELETE FROM public.inventory WHERE id = $1", [req.params.inventoryId]);
    await writeAuditLog(client, req.user, { action: "inventory_deleted", entityType: "inventory", entityId: req.params.inventoryId, oldValues: current.rows[0] });
    await client.query("COMMIT");
    return res.status(204).end();
  } catch (error) { await client.query("ROLLBACK"); return next(error); } finally { client.release(); }
}

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
    let previousPeriod = null;
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
        `SELECT * FROM inventory_unavailability
          WHERE id = $1 AND inventory_id = $2 FOR UPDATE`,
        [periodId, inventoryId]
      );
      if (currentResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "PERIOD_NOT_FOUND", message: "Unavailability period was not found." });
      }
      previousPeriod = currentResult.rows[0];
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
        LIMIT 1`,
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

    await writeAuditLog(client, req.user, {
      action: periodId ? "unavailability_updated" : "unavailability_created",
      entityType: "inventory_unavailability",
      entityId: result.rows[0].id,
      oldValues: previousPeriod,
      newValues: result.rows[0],
      metadata: { inventoryId: String(inventoryId) },
    });

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
      `SELECT * FROM inventory_unavailability
        WHERE id = $1 AND inventory_id = $2 FOR UPDATE`,
      [req.params.periodId, req.params.inventoryId]
    );
    if (periodResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "PERIOD_NOT_FOUND", message: "Unavailability period was not found." });
    }

    await client.query(`DELETE FROM inventory_unavailability WHERE id = $1`, [req.params.periodId]);
    await writeAuditLog(client, req.user, {
      action: "unavailability_deleted",
      entityType: "inventory_unavailability",
      entityId: req.params.periodId,
      oldValues: periodResult.rows[0],
      metadata: { inventoryId: String(req.params.inventoryId) },
    });
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
  deleteInventory,
  deleteUnavailability,
  listUnavailability,
  normalizeUnavailability,
  normalizeInventory,
  inventoryErrors,
  saveInventory,
  saveUnavailability,
  unavailabilityErrors,
};
