"use strict";

const pool = require("../config/db");
const { writeAuditLog } = require("../utils/auditLog");
const { createAssetQr, parseAssetQr } = require("../utils/qrCredential");
const { loadInventoryCommitment, usableInventoryQuantity } = require("../utils/inventoryCommitments");

const ID_PATTERN = /^[1-9]\d*$/;
const CONDITIONS = new Set(["good", "fair", "damaged", "under_inspection", "retired"]);
const STATUSES = new Set(["available", "maintenance", "retired"]);

function assetResponse(row, includeToken = false) {
  const asset = {
    id: row.id, inventoryId: row.inventory_id, itemName: row.item_name,
    assetNumber: row.asset_number, serialNumber: row.serial_number,
    condition: row.condition, status: row.status,
    currentBorrowRequestId: row.current_borrow_request_id,
    lastInspectedAt: row.last_inspected_at, maintenanceNote: row.maintenance_note,
    inspectionIntervalDays: row.inspection_interval_days, nextInspectionDate: row.next_inspection_date,
    incident: row.incident_id ? { id: row.incident_id, status: row.incident_status, reason: row.incident_reason, reportedAt: row.incident_reported_at } : null,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
  if (includeToken) asset.qrToken = createAssetQr(row.qr_public_id, row.qr_version);
  return asset;
}

async function listAssets(req, res, next) {
  if (!ID_PATTERN.test(req.params.inventoryId)) return res.status(400).json({ error: "INVALID_INVENTORY_ID", message: "Inventory ID is invalid." });
  try {
    const result = await pool.query(
      `SELECT asset.*, inventory.item_name, incident.id AS incident_id, incident.status AS incident_status,
              incident.reason AS incident_reason, incident.reported_at AS incident_reported_at
         FROM public.inventory_assets asset
       JOIN public.inventory inventory ON inventory.id=asset.inventory_id
       LEFT JOIN public.serialized_asset_incidents incident ON incident.asset_id=asset.id AND incident.status='open'
       WHERE asset.inventory_id=$1 ORDER BY asset.asset_number`, [req.params.inventoryId]
    );
    return res.json({ assets: result.rows.map((row) => assetResponse(row, true)) });
  } catch (error) {
    if (error.code === "QR_NOT_CONFIGURED") return res.status(503).json({ error: error.code, message: error.message });
    return next(error);
  }
}

async function createAsset(req, res, next) {
  if (!ID_PATTERN.test(req.params.inventoryId)) return res.status(400).json({ error: "INVALID_INVENTORY_ID", message: "Inventory ID is invalid." });
  const serialNumber = typeof req.body?.serialNumber === "string" ? req.body.serialNumber.trim() : "";
  if (serialNumber.length > 120) return res.status(422).json({ error: "INVALID_SERIAL_NUMBER", message: "Serial number cannot exceed 120 characters." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inventory = await client.query(`SELECT * FROM public.inventory WHERE id=$1 FOR UPDATE`, [req.params.inventoryId]);
    if (!inventory.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "INVENTORY_NOT_FOUND", message: "Inventory item was not found." }); }
    if (inventory.rows[0].tracking_type !== "serialized") { await client.query("ROLLBACK"); return res.status(409).json({ error: "NOT_SERIALIZED_INVENTORY", message: "Assets can only be added to serialized inventory." }); }
    const inserted = await client.query(
      `INSERT INTO public.inventory_assets (inventory_id, asset_number, serial_number, created_by)
       VALUES ($1, 'PENDING-' || gen_random_uuid()::text, $2, $3) RETURNING *`,
      [req.params.inventoryId, serialNumber || null, req.user.id]
    );
    const assetNumber = `AST-${String(inserted.rows[0].id).padStart(6, "0")}`;
    const updated = await client.query(
      `UPDATE public.inventory_assets SET asset_number=$2, updated_at=now() WHERE id=$1 RETURNING *`,
      [inserted.rows[0].id, assetNumber]
    );
    await client.query(`UPDATE public.inventory SET quantity=quantity+1, updated_at=now() WHERE id=$1`, [req.params.inventoryId]);
    await writeAuditLog(client, req.user, { action: "inventory_asset_created", entityType: "inventory_asset", entityId: updated.rows[0].id, newValues: updated.rows[0] });
    await client.query("COMMIT");
    return res.status(201).json({ asset: assetResponse({ ...updated.rows[0], item_name: inventory.rows[0].item_name }, true) });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ error: "DUPLICATE_ASSET", message: "That serial or asset number is already registered." });
    if (error.code === "QR_NOT_CONFIGURED") return res.status(503).json({ error: error.code, message: error.message });
    return next(error);
  } finally { client.release(); }
}

async function updateAsset(req, res, next) {
  if (!ID_PATTERN.test(req.params.inventoryId) || !ID_PATTERN.test(req.params.assetId)) return res.status(400).json({ error: "INVALID_ASSET_ID", message: "Asset ID is invalid." });
  const status = req.body?.status;
  const condition = req.body?.condition;
  const note = typeof req.body?.maintenanceNote === "string" ? req.body.maintenanceNote.trim() : "";
  const serialNumber = typeof req.body?.serialNumber === "string" ? req.body.serialNumber.trim() : "";
  if (!STATUSES.has(status) || !CONDITIONS.has(condition) || note.length > 1000 || serialNumber.length > 120) {
    return res.status(422).json({ error: "INVALID_ASSET", message: "Asset status, condition, serial number, or note is invalid." });
  }
  if (status === "maintenance" && note.length < 5) return res.status(422).json({ error: "MAINTENANCE_NOTE_REQUIRED", message: "Describe the inspection or maintenance reason using at least 5 characters." });
  if ((status === "retired") !== (condition === "retired")) return res.status(422).json({ error: "INVALID_ASSET_STATE", message: "Retired assets must use both retired status and condition." });
  if ((status === "available" && !["good", "fair"].includes(condition)) || (status === "maintenance" && !["damaged", "under_inspection"].includes(condition))) {
    return res.status(422).json({ error: "INVALID_ASSET_STATE", message: "Available assets must be good/fair; maintenance assets must be damaged/under inspection." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inventoryResult = await client.query(`SELECT * FROM public.inventory WHERE id=$1 FOR UPDATE`, [req.params.inventoryId]);
    if (!inventoryResult.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "INVENTORY_NOT_FOUND", message: "Inventory item was not found." }); }
    const currentResult = await client.query(`SELECT * FROM public.inventory_assets WHERE id=$1 AND inventory_id=$2 FOR UPDATE`, [req.params.assetId, req.params.inventoryId]);
    if (!currentResult.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "ASSET_NOT_FOUND", message: "Asset was not found." }); }
    const current = currentResult.rows[0];
    if (current.status === "borrowed") { await client.query("ROLLBACK"); return res.status(409).json({ error: "ASSET_CURRENTLY_BORROWED", message: "A borrowed asset cannot be edited or retired." }); }
    if (current.status === "missing") { await client.query("ROLLBACK"); return res.status(409).json({ error: "ASSET_HAS_OPEN_INCIDENT", message: "A missing asset must be resolved through its incident record before it can change state." }); }
    if (current.status === "retired" && status !== "retired") { await client.query("ROLLBACK"); return res.status(409).json({ error: "ASSET_RETIRED", message: "A retired asset cannot be reactivated." }); }
    if (current.status === "maintenance" && status !== "maintenance") {
      const activeMaintenance = await client.query(`SELECT id FROM public.asset_maintenance_records WHERE asset_id=$1 AND status IN ('under_inspection','under_repair') LIMIT 1`, [current.id]);
      if (activeMaintenance.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: "ACTIVE_MAINTENANCE", message: "Complete or retire this asset through its active maintenance record." }); }
    }
    const retiring = current.status !== "retired" && status === "retired";
    const oldBreakage = current.status === "maintenance" && current.condition === "damaged" ? 1 : 0;
    const oldDefective = current.status === "maintenance" && current.condition !== "damaged" ? 1 : 0;
    const newBreakage = status === "maintenance" && condition === "damaged" ? 1 : 0;
    const newDefective = status === "maintenance" && condition !== "damaged" ? 1 : 0;
    const quantityDelta = retiring ? -1 : 0;
    const breakageDelta = (retiring ? 0 : newBreakage) - oldBreakage;
    const defectiveDelta = (retiring ? 0 : newDefective) - oldDefective;
    const candidateInventory = {
      ...inventoryResult.rows[0],
      quantity: Number(inventoryResult.rows[0].quantity) + quantityDelta,
      breakage: Number(inventoryResult.rows[0].breakage) + breakageDelta,
      defective: Number(inventoryResult.rows[0].defective) + defectiveDelta,
    };
    const commitment = await loadInventoryCommitment(client, req.params.inventoryId);
    if (!commitment.valid || usableInventoryQuantity(candidateInventory) < commitment.requiredCapacity) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "ASSET_COMMITMENT_CONFLICT", message: "This change would leave insufficient usable assets for active borrowing commitments." });
    }
    const changed = await client.query(
      `UPDATE public.inventory SET quantity=quantity+$2, breakage=breakage+$3, defective=defective+$4, updated_at=now()
        WHERE id=$1 AND quantity+$2>=0 AND breakage+$3>=0 AND defective+$4>=0 RETURNING id`,
      [req.params.inventoryId, quantityDelta, breakageDelta, defectiveDelta]
    );
    if (!changed.rowCount) throw new Error("Serialized inventory counters are inconsistent.");
    const updated = await client.query(
      `UPDATE public.inventory_assets SET serial_number=$3, status=$4, condition=$5, maintenance_note=$6,
         last_inspected_at=CASE WHEN $7 THEN now() ELSE last_inspected_at END,
         last_inspected_by=CASE WHEN $7 THEN $8 ELSE last_inspected_by END, updated_at=now()
       WHERE id=$1 AND inventory_id=$2 RETURNING *`,
      [req.params.assetId, req.params.inventoryId, serialNumber || null, status, condition, note || null, req.body?.inspected === true, req.user.id]
    );
    if (status === "maintenance" && current.status !== "maintenance") {
      await client.query(
        `INSERT INTO public.asset_maintenance_records
          (asset_id, inventory_id, source, status, problem_description, assigned_to, opened_by)
         VALUES ($1,$2,'manual','under_inspection',$3,$4,$4)`,
        [current.id, req.params.inventoryId, note, req.user.id]
      );
    }
    await writeAuditLog(client, req.user, { action: retiring ? "inventory_asset_retired" : "inventory_asset_updated", entityType: "inventory_asset", entityId: current.id, oldValues: current, newValues: updated.rows[0] });
    await client.query("COMMIT");
    return res.json({ asset: assetResponse(updated.rows[0], true) });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ error: "DUPLICATE_ASSET", message: "That serial number is already registered." });
    return next(error);
  } finally { client.release(); }
}

async function lookupAssetQr(req, res, next) {
  try {
    const parsed = parseAssetQr(req.body?.token);
    if (!parsed) return res.status(400).json({ error: "INVALID_ASSET_QR", message: "This asset QR is invalid." });
    const result = await pool.query(
      `SELECT asset.*, inventory.item_name, inventory.tracking_type FROM public.inventory_assets asset
       JOIN public.inventory inventory ON inventory.id=asset.inventory_id
       LEFT JOIN public.laboratory_rooms room ON room.id=inventory.room_id
       WHERE asset.qr_public_id=$1 AND ($2::boolean=false OR room.department_id=$3::bigint)`,
      [parsed.publicId, req.user.role === "staff", req.user.department_id]
    );
    const asset = result.rows[0];
    if (!asset || asset.qr_version !== parsed.version) return res.status(404).json({ error: "ASSET_QR_OUTDATED", message: "This asset QR is unknown or outdated." });
    return res.json({ asset: assetResponse(asset) });
  } catch (error) {
    if (error.code === "QR_NOT_CONFIGURED") return res.status(503).json({ error: error.code, message: error.message });
    return next(error);
  }
}

async function resolveAssetIncident(req, res, next) {
  if (!ID_PATTERN.test(req.params.inventoryId) || !ID_PATTERN.test(req.params.assetId) || !ID_PATTERN.test(req.params.incidentId)) return res.status(400).json({ error: "INVALID_INCIDENT_ID", message: "Asset or incident ID is invalid." });
  const resolution = req.body?.resolution;
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  if (!new Set(["recovered", "written_off"]).has(resolution) || note.length < 5 || note.length > 500) return res.status(422).json({ error: "INVALID_INCIDENT_RESOLUTION", message: "Choose recovered or written off and provide a 5 to 500 character resolution note." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inventoryResult = await client.query(`SELECT * FROM public.inventory WHERE id=$1 FOR UPDATE`, [req.params.inventoryId]);
    const result = await client.query(
      `SELECT incident.*, asset.asset_number, asset.status AS asset_status, request.user_id
         FROM public.serialized_asset_incidents incident
         JOIN public.inventory_assets asset ON asset.id=incident.asset_id
         JOIN public.borrow_requests request ON request.id=incident.request_id
        WHERE incident.id=$1 AND incident.asset_id=$2 AND asset.inventory_id=$3 FOR UPDATE OF incident, asset`,
      [req.params.incidentId, req.params.assetId, req.params.inventoryId]
    );
    if (!inventoryResult.rowCount || !result.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "INCIDENT_NOT_FOUND", message: "The missing-asset incident was not found." }); }
    const incident = result.rows[0];
    if (incident.status !== "open" || incident.asset_status !== "missing") { await client.query("ROLLBACK"); return res.status(409).json({ error: "INCIDENT_ALREADY_RESOLVED", message: "This incident is no longer open." }); }
    const writtenOff = resolution === "written_off";
    const counterResult = await client.query(
      `UPDATE public.inventory SET quantity=quantity-$2, missing=missing-1, updated_at=now()
        WHERE id=$1 AND missing>=1 AND quantity-$2>=0 RETURNING id`, [req.params.inventoryId, writtenOff ? 1 : 0]
    );
    if (!counterResult.rowCount) throw new Error("Missing serialized asset counters are inconsistent.");
    await client.query(
      `UPDATE public.inventory_assets SET status=$2, condition=$3, maintenance_note=NULL,
         last_inspected_at=CASE WHEN $2='available' THEN now() ELSE last_inspected_at END,
         last_inspected_by=CASE WHEN $2='available' THEN $4 ELSE last_inspected_by END, updated_at=now() WHERE id=$1`,
      [req.params.assetId, writtenOff ? "retired" : "available", writtenOff ? "retired" : "good", req.user.id]
    );
    const resolved = await client.query(
      `UPDATE public.serialized_asset_incidents SET status=$2, resolved_by=$3, resolved_at=now(), resolution_note=$4
        WHERE id=$1 RETURNING *`, [req.params.incidentId, resolution, req.user.id, note]
    );
    await writeAuditLog(client, req.user, { action: `serialized_asset_${resolution}`, entityType: "serialized_asset_incident", entityId: incident.id, oldValues: incident, newValues: resolved.rows[0] });
    await client.query("COMMIT");
    return res.json({ incident: resolved.rows[0] });
  } catch (error) { await client.query("ROLLBACK"); return next(error); } finally { client.release(); }
}

module.exports = { createAsset, listAssets, lookupAssetQr, resolveAssetIncident, updateAsset };
