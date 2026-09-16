"use strict";

const pool = require("../config/db");
const { writeAuditLog } = require("../utils/auditLog");

const ID = /^[1-9]\d*$/;
const RESULTS = new Set(["good", "fair", "damaged"]);

function intervalValue(value) {
  if (value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 3650 ? parsed : Number.NaN;
}

function inspectionErrors(body = {}) {
  const result = typeof body.result === "string" ? body.result.toLowerCase() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const errors = [];
  if (!RESULTS.has(result)) errors.push("Choose a valid inspection result.");
  if (notes.length < 5 || notes.length > 1000) errors.push("Inspection notes must contain 5 to 1,000 characters.");
  return { result, notes, errors };
}

async function listInspections(req, res, next) {
  if (![req.params.inventoryId, req.params.assetId].every((value) => ID.test(value))) return res.status(400).json({ error: "INVALID_ASSET_ID", message: "Asset ID is invalid." });
  try {
    const asset = await pool.query(`SELECT asset.*, inventory.item_name FROM public.inventory_assets asset JOIN public.inventory inventory ON inventory.id=asset.inventory_id WHERE asset.id=$1 AND asset.inventory_id=$2`, [req.params.assetId, req.params.inventoryId]);
    if (!asset.rowCount) return res.status(404).json({ error: "ASSET_NOT_FOUND", message: "Asset was not found." });
    const history = await pool.query(`SELECT inspection.*, profile.full_name AS inspector_name FROM public.asset_inspections inspection LEFT JOIN public.profiles profile ON profile.user_id=inspection.inspected_by WHERE inspection.asset_id=$1 ORDER BY inspection.inspected_at DESC, inspection.id DESC`, [req.params.assetId]);
    return res.json({ settings: { intervalDays: asset.rows[0].inspection_interval_days, nextInspectionDate: asset.rows[0].next_inspection_date }, inspections: history.rows });
  } catch (error) { return next(error); }
}

async function configureInspection(req, res, next) {
  if (![req.params.inventoryId, req.params.assetId].every((value) => ID.test(value))) return res.status(400).json({ error: "INVALID_ASSET_ID", message: "Asset ID is invalid." });
  const interval = intervalValue(req.body?.intervalDays);
  if (Number.isNaN(interval)) return res.status(422).json({ error: "INVALID_INSPECTION_INTERVAL", message: "Inspection interval must be between 1 and 3,650 days, or blank to disable it." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE public.inventory_assets SET inspection_interval_days=$3,
         next_inspection_date=CASE WHEN $3::integer IS NULL THEN NULL WHEN last_inspected_at IS NULL THEN (now() AT TIME ZONE 'Asia/Manila')::date ELSE (last_inspected_at AT TIME ZONE 'Asia/Manila')::date+$3 END, updated_at=now()
       WHERE id=$1 AND inventory_id=$2 AND status<>'retired' RETURNING *`, [req.params.assetId, req.params.inventoryId, interval]
    );
    if (!updated.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "ASSET_NOT_FOUND", message: "The asset was not found or is retired." }); }
    await writeAuditLog(client, req.user, { action: "asset_inspection_schedule_updated", entityType: "inventory_asset", entityId: req.params.assetId, newValues: { intervalDays: interval, nextInspectionDate: updated.rows[0].next_inspection_date } });
    await client.query("COMMIT");
    return res.json({ intervalDays: interval, nextInspectionDate: updated.rows[0].next_inspection_date });
  } catch (error) { await client.query("ROLLBACK"); return next(error); } finally { client.release(); }
}

async function recordInspection(req, res, next) {
  if (![req.params.inventoryId, req.params.assetId].every((value) => ID.test(value))) return res.status(400).json({ error: "INVALID_ASSET_ID", message: "Asset ID is invalid." });
  const input = inspectionErrors(req.body);
  if (input.errors.length) return res.status(422).json({ error: "INVALID_INSPECTION", message: input.errors[0], reasons: input.errors });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inventory = await client.query(`SELECT * FROM public.inventory WHERE id=$1 FOR UPDATE`, [req.params.inventoryId]);
    const assetResult = await client.query(`SELECT * FROM public.inventory_assets WHERE id=$1 AND inventory_id=$2 FOR UPDATE`, [req.params.assetId, req.params.inventoryId]);
    if (!inventory.rowCount || !assetResult.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "ASSET_NOT_FOUND", message: "Asset was not found." }); }
    const asset = assetResult.rows[0];
    if (asset.status !== "available") { await client.query("ROLLBACK"); return res.status(409).json({ error: "ASSET_NOT_INSPECTABLE", message: "Only an available asset can receive a preventive inspection. Resolve borrowing, maintenance, or incident work first." }); }
    const damaged = input.result === "damaged";
    if (damaged) {
      const changed = await client.query(`UPDATE public.inventory SET breakage=breakage+1, updated_at=now() WHERE id=$1 RETURNING id`, [req.params.inventoryId]);
      if (!changed.rowCount) throw new Error("Serialized inspection counters are inconsistent.");
    }
    const nextDateSql = asset.inspection_interval_days ? `(now() AT TIME ZONE 'Asia/Manila')::date+$7::integer` : "NULL";
    const updated = await client.query(`UPDATE public.inventory_assets SET status=$3, condition=$4, maintenance_note=$5, last_inspected_at=now(), last_inspected_by=$6, next_inspection_date=${nextDateSql}, updated_at=now() WHERE id=$1 AND inventory_id=$2 RETURNING *`, [req.params.assetId, req.params.inventoryId, damaged ? "maintenance" : "available", input.result, damaged ? input.notes : null, req.user.id, asset.inspection_interval_days]);
    const nextInspectionDate = updated.rows[0].next_inspection_date;
    const inspection = await client.query(`INSERT INTO public.asset_inspections (asset_id,inventory_id,result,notes,inspected_by,next_inspection_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [req.params.assetId, req.params.inventoryId, input.result, input.notes, req.user.id, nextInspectionDate]);
    if (damaged) await client.query(`INSERT INTO public.asset_maintenance_records (asset_id,inventory_id,source,status,problem_description,assigned_to,opened_by) VALUES ($1,$2,'manual','under_inspection',$3,$4,$4)`, [req.params.assetId, req.params.inventoryId, input.notes, req.user.id]);
    await writeAuditLog(client, req.user, { action: "asset_inspected", entityType: "inventory_asset", entityId: req.params.assetId, oldValues: { status: asset.status, condition: asset.condition, nextInspectionDate: asset.next_inspection_date }, newValues: { result: input.result, nextInspectionDate } });
    await client.query("COMMIT");
    return res.status(201).json({ inspection: inspection.rows[0], maintenanceCreated: damaged });
  } catch (error) { await client.query("ROLLBACK"); return next(error); } finally { client.release(); }
}

module.exports = { configureInspection, inspectionErrors, intervalValue, listInspections, recordInspection };
