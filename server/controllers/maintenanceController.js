"use strict";

const pool = require("../config/db");
const { writeAuditLog } = require("../utils/auditLog");
const { loadInventoryCommitment, usableInventoryQuantity } = require("../utils/inventoryCommitments");

const ID_PATTERN = /^[1-9]\d*$/;
const ACTIVE_STATUSES = new Set(["under_inspection", "under_repair"]);
const ALL_STATUSES = new Set([...ACTIVE_STATUSES, "completed", "retired"]);

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeMaintenanceUpdate(body = {}) {
  const cost = typeof body.cost === "number" || typeof body.cost === "string" ? Number(body.cost) : 0;
  return {
    status: body.status,
    repairNotes: typeof body.repairNotes === "string" ? body.repairNotes.trim() : "",
    dueDate: typeof body.dueDate === "string" ? body.dueDate.trim() : "",
    cost,
  };
}

function maintenanceErrors(value) {
  const errors = [];
  if (!ALL_STATUSES.has(value.status)) errors.push("Choose a valid maintenance status.");
  if (value.repairNotes.length > 2000) errors.push("Repair notes cannot exceed 2,000 characters.");
  if (value.dueDate && !validDate(value.dueDate)) errors.push("Enter a valid maintenance due date.");
  if (!Number.isFinite(value.cost) || value.cost < 0 || value.cost > 9999999999.99) errors.push("Enter a valid non-negative maintenance cost.");
  if (["completed", "retired"].includes(value.status) && value.repairNotes.length < 5) errors.push("Completion notes must contain at least 5 characters.");
  return errors;
}

function maintenanceResponse(row) {
  return {
    id: row.id,
    assetId: row.asset_id,
    inventoryId: row.inventory_id,
    source: row.source,
    status: row.status,
    problemDescription: row.problem_description,
    repairNotes: row.repair_notes,
    assignedTo: row.assigned_to,
    assignedName: row.assigned_name,
    dueDate: row.due_date,
    cost: Number(row.cost || 0),
    openedAt: row.opened_at,
    completedAt: row.completed_at,
    overdue: ACTIVE_STATUSES.has(row.status) && row.due_date && String(row.due_date).slice(0, 10) < row.today,
  };
}

async function listAssetMaintenance(req, res, next) {
  if (![req.params.inventoryId, req.params.assetId].every((id) => ID_PATTERN.test(id))) return res.status(400).json({ error: "INVALID_ASSET_ID", message: "Asset ID is invalid." });
  try {
    const asset = await pool.query(`SELECT id FROM public.inventory_assets WHERE id=$1 AND inventory_id=$2`, [req.params.assetId, req.params.inventoryId]);
    if (!asset.rowCount) return res.status(404).json({ error: "ASSET_NOT_FOUND", message: "Asset was not found." });
    const result = await pool.query(
      `SELECT record.*, profile.full_name AS assigned_name, (now() AT TIME ZONE 'Asia/Manila')::date::text AS today
         FROM public.asset_maintenance_records record
         LEFT JOIN public.profiles profile ON profile.user_id=record.assigned_to
        WHERE record.asset_id=$1 AND record.inventory_id=$2
        ORDER BY record.opened_at DESC, record.id DESC`,
      [req.params.assetId, req.params.inventoryId]
    );
    return res.json({ maintenance: result.rows.map(maintenanceResponse) });
  } catch (error) { return next(error); }
}

async function updateAssetMaintenance(req, res, next) {
  if (![req.params.inventoryId, req.params.assetId, req.params.maintenanceId].every((id) => ID_PATTERN.test(id))) return res.status(400).json({ error: "INVALID_MAINTENANCE_ID", message: "Maintenance record ID is invalid." });
  const update = normalizeMaintenanceUpdate(req.body);
  const errors = maintenanceErrors(update);
  if (errors.length) return res.status(422).json({ error: "INVALID_MAINTENANCE_UPDATE", reasons: errors, message: errors[0] });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inventoryResult = await client.query(`SELECT * FROM public.inventory WHERE id=$1 FOR UPDATE`, [req.params.inventoryId]);
    const assetResult = await client.query(`SELECT * FROM public.inventory_assets WHERE id=$1 AND inventory_id=$2 FOR UPDATE`, [req.params.assetId, req.params.inventoryId]);
    const recordResult = await client.query(`SELECT * FROM public.asset_maintenance_records WHERE id=$1 AND asset_id=$2 AND inventory_id=$3 FOR UPDATE`, [req.params.maintenanceId, req.params.assetId, req.params.inventoryId]);
    if (!inventoryResult.rowCount || !assetResult.rowCount || !recordResult.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "MAINTENANCE_NOT_FOUND", message: "Maintenance record was not found." }); }
    const current = recordResult.rows[0];
    if (!ACTIVE_STATUSES.has(current.status)) { await client.query("ROLLBACK"); return res.status(409).json({ error: "MAINTENANCE_CLOSED", message: "This maintenance record is already closed." }); }
    if (assetResult.rows[0].status !== "maintenance") { await client.query("ROLLBACK"); return res.status(409).json({ error: "ASSET_STATE_CONFLICT", message: "The asset is no longer under maintenance." }); }

    const closing = !ACTIVE_STATUSES.has(update.status);
    const retiring = update.status === "retired";
    if (closing) {
      const candidate = { ...inventoryResult.rows[0], quantity: Number(inventoryResult.rows[0].quantity) - (retiring ? 1 : 0), breakage: Number(inventoryResult.rows[0].breakage) - (assetResult.rows[0].condition === "damaged" ? 1 : 0), defective: Number(inventoryResult.rows[0].defective) - (assetResult.rows[0].condition === "damaged" ? 0 : 1) };
      const commitment = await loadInventoryCommitment(client, req.params.inventoryId);
      if (!commitment.valid || usableInventoryQuantity(candidate) < commitment.requiredCapacity) { await client.query("ROLLBACK"); return res.status(409).json({ error: "ASSET_COMMITMENT_CONFLICT", message: "Closing this maintenance case would leave insufficient inventory for active commitments." }); }
      const counters = await client.query(
        `UPDATE public.inventory SET quantity=quantity-$2, breakage=breakage-$3, defective=defective-$4, updated_at=now()
          WHERE id=$1 AND quantity-$2>=0 AND breakage-$3>=0 AND defective-$4>=0 RETURNING id`,
        [req.params.inventoryId, retiring ? 1 : 0, assetResult.rows[0].condition === "damaged" ? 1 : 0, assetResult.rows[0].condition === "damaged" ? 0 : 1]
      );
      if (!counters.rowCount) throw new Error("Serialized maintenance counters are inconsistent.");
      await client.query(
        `UPDATE public.inventory_assets SET status=$2, condition=$3, maintenance_note=NULL,
           last_inspected_at=CASE WHEN $2='available' THEN now() ELSE last_inspected_at END,
           last_inspected_by=CASE WHEN $2='available' THEN $4 ELSE last_inspected_by END, updated_at=now() WHERE id=$1`,
        [req.params.assetId, retiring ? "retired" : "available", retiring ? "retired" : "good", req.user.id]
      );
    } else {
      await client.query(`UPDATE public.inventory_assets SET maintenance_note=$2, last_inspected_at=now(), last_inspected_by=$3, updated_at=now() WHERE id=$1`, [req.params.assetId, update.repairNotes || current.problem_description, req.user.id]);
    }
    const updated = await client.query(
      `UPDATE public.asset_maintenance_records SET status=$2, repair_notes=$3, due_date=$4, cost=$5,
         assigned_to=COALESCE(assigned_to,$6), completed_by=CASE WHEN $7 THEN $6 ELSE NULL END,
         completed_at=CASE WHEN $7 THEN now() ELSE NULL END, updated_at=now() WHERE id=$1 RETURNING *`,
      [current.id, update.status, update.repairNotes || null, update.dueDate || null, update.cost, req.user.id, closing]
    );
    await writeAuditLog(client, req.user, { action: closing ? `asset_maintenance_${update.status}` : "asset_maintenance_updated", entityType: "asset_maintenance", entityId: current.id, oldValues: current, newValues: updated.rows[0] });
    await client.query("COMMIT");
    return res.json({ maintenance: maintenanceResponse({ ...updated.rows[0], assigned_name: req.user.full_name, today: new Date().toISOString().slice(0, 10) }) });
  } catch (error) { await client.query("ROLLBACK"); return next(error); } finally { client.release(); }
}

module.exports = { listAssetMaintenance, maintenanceErrors, normalizeMaintenanceUpdate, updateAssetMaintenance };
