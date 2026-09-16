"use strict";

const pool = require("../config/db");
const { writeAuditLog } = require("../utils/auditLog");
const { parseAssetQr } = require("../utils/qrCredential");
const { loadInventoryCommitment, usableInventoryQuantity } = require("../utils/inventoryCommitments");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^[1-9]\d*$/;
const CONDITIONS = new Set(["good", "fair", "damaged", "under_inspection"]);

async function loadSession(database, id, lock = false) {
  const session = await database.query(`SELECT * FROM public.inventory_reconciliations WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [id]);
  return session.rows[0] ?? null;
}

async function sessionResponse(database, session) {
  const items = await database.query(
    `SELECT entry.*, inventory.item_name FROM public.inventory_reconciliation_items entry
     JOIN public.inventory inventory ON inventory.id=entry.inventory_id WHERE entry.reconciliation_id=$1 ORDER BY inventory.item_name`, [session.id]
  );
  const assets = await database.query(
    `SELECT entry.*, asset.asset_number, asset.serial_number FROM public.inventory_reconciliation_assets entry
     JOIN public.inventory_assets asset ON asset.id=entry.asset_id WHERE entry.reconciliation_id=$1 ORDER BY asset.asset_number`, [session.id]
  );
  return { session, items: items.rows, assets: assets.rows };
}

async function getActiveReconciliation(req, res, next) {
  try {
    const result = await pool.query(`SELECT * FROM public.inventory_reconciliations WHERE status='in_progress' ORDER BY started_at DESC LIMIT 1`);
    return res.json(result.rowCount ? await sessionResponse(pool, result.rows[0]) : { session: null, items: [], assets: [] });
  } catch (error) { return next(error); }
}

async function createReconciliation(req, res, next) {
  const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
  if (notes.length > 1000) return res.status(422).json({ error: "INVALID_NOTES", message: "Stocktake notes cannot exceed 1000 characters." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const active = await client.query(`SELECT id FROM public.inventory_reconciliations WHERE status='in_progress' FOR UPDATE`);
    if (active.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: "RECONCILIATION_ACTIVE", message: "Finish or cancel the active physical count first." }); }
    const created = await client.query(`INSERT INTO public.inventory_reconciliations (notes, started_by) VALUES ($1,$2) RETURNING *`, [notes || null, req.user.id]);
    await client.query(
      `INSERT INTO public.inventory_reconciliation_items (reconciliation_id, inventory_id, tracking_type, expected_on_hand)
       SELECT $1, inventory.id, inventory.tracking_type,
         CASE WHEN inventory.tracking_type='bulk' THEN GREATEST(inventory.quantity+inventory.additional_qty-inventory.replaces-inventory.missing-inventory.breakage-inventory.defective-inventory.total_loss-inventory.borrowed_quantity,0)
         ELSE (SELECT count(*)::integer FROM public.inventory_assets asset WHERE asset.inventory_id=inventory.id AND asset.status IN ('available','maintenance')) END
       FROM public.inventory inventory`, [created.rows[0].id]
    );
    await client.query(
      `INSERT INTO public.inventory_reconciliation_assets (reconciliation_id, asset_id, inventory_id, expected_status, expected_condition)
       SELECT $1,id,inventory_id,status,condition FROM public.inventory_assets WHERE status <> 'borrowed'`, [created.rows[0].id]
    );
    await writeAuditLog(client, req.user, { action: "inventory_reconciliation_started", entityType: "inventory_reconciliation", entityId: created.rows[0].id, newValues: { notes } });
    await client.query("COMMIT");
    return res.status(201).json(await sessionResponse(pool, created.rows[0]));
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ error: "RECONCILIATION_ACTIVE", message: "A physical count is already active." });
    return next(error);
  } finally { client.release(); }
}

async function recordBulkCount(req, res, next) {
  if (!UUID.test(req.params.id) || !ID.test(req.params.inventoryId) || !Number.isSafeInteger(req.body?.count) || req.body.count < 0 || req.body.count > 2_147_483_647) return res.status(422).json({ error: "INVALID_COUNT", message: "Count must be a non-negative whole number." });
  try {
    const result = await pool.query(
      `UPDATE public.inventory_reconciliation_items entry SET counted_on_hand=$3, discrepancy=$3-expected_on_hand
       FROM public.inventory_reconciliations session WHERE entry.reconciliation_id=$1 AND entry.inventory_id=$2
         AND entry.tracking_type='bulk' AND session.id=entry.reconciliation_id AND session.status='in_progress' RETURNING entry.*`,
      [req.params.id, req.params.inventoryId, req.body.count]
    );
    if (!result.rowCount) return res.status(409).json({ error: "COUNT_NOT_EDITABLE", message: "The bulk count entry is unavailable or the stocktake is closed." });
    return res.json({ item: result.rows[0] });
  } catch (error) { return next(error); }
}

async function scanReconciliationAsset(req, res, next) {
  if (!UUID.test(req.params.id) || !CONDITIONS.has(req.body?.condition)) return res.status(422).json({ error: "INVALID_ASSET_SCAN", message: "A valid asset QR and observed condition are required." });
  try {
    const parsed = parseAssetQr(req.body?.token);
    if (!parsed) return res.status(400).json({ error: "INVALID_ASSET_QR", message: "This asset QR is invalid." });
    const result = await pool.query(
      `UPDATE public.inventory_reconciliation_assets entry SET observed_condition=$3, scanned_at=now(), scanned_by=$4,
         discrepancy_type=CASE WHEN entry.expected_status IN ('missing','retired') THEN 'unexpected'
           WHEN entry.expected_condition<>$3 THEN 'condition_mismatch' ELSE NULL END
       FROM public.inventory_reconciliations session, public.inventory_assets asset
       WHERE entry.reconciliation_id=$1 AND entry.asset_id=asset.id AND asset.qr_public_id=$2
         AND asset.qr_version=$5 AND session.id=entry.reconciliation_id AND session.status='in_progress'
       RETURNING entry.*, asset.asset_number`, [req.params.id, parsed.publicId, req.body.condition, req.user.id, parsed.version]
    );
    if (!result.rowCount) return res.status(409).json({ error: "ASSET_EXCLUDED_OR_ALREADY_CHANGED", message: "The asset is unknown, borrowed, its QR is outdated, or the stocktake is closed." });
    return res.json({ asset: result.rows[0] });
  } catch (error) {
    if (error.code === "QR_NOT_CONFIGURED") return res.status(503).json({ error: error.code, message: error.message });
    return next(error);
  }
}

async function completeReconciliation(req, res, next) {
  if (!UUID.test(req.params.id)) return res.status(400).json({ error: "INVALID_RECONCILIATION_ID", message: "Reconciliation ID is invalid." });
  const apply = req.body?.applyAdjustments === true;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const session = await loadSession(client, req.params.id, true);
    if (!session || session.status !== "in_progress") { await client.query("ROLLBACK"); return res.status(409).json({ error: "RECONCILIATION_CLOSED", message: "This stocktake is not active." }); }
    const items = await client.query(`SELECT * FROM public.inventory_reconciliation_items WHERE reconciliation_id=$1 ORDER BY inventory_id FOR UPDATE`, [session.id]);
    if (items.rows.some((item) => item.tracking_type === "bulk" && item.counted_on_hand == null)) { await client.query("ROLLBACK"); return res.status(422).json({ error: "INCOMPLETE_BULK_COUNTS", message: "Enter a physical count for every bulk inventory classification." }); }
    const lockedInventory = await client.query(`SELECT * FROM public.inventory WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE`, [items.rows.map((item) => item.inventory_id)]);
    const inventoryById = new Map(lockedInventory.rows.map((item) => [String(item.id), item]));
    const assets = await client.query(`SELECT entry.*, asset.status, asset.condition FROM public.inventory_reconciliation_assets entry JOIN public.inventory_assets asset ON asset.id=entry.asset_id WHERE entry.reconciliation_id=$1 ORDER BY entry.inventory_id, entry.asset_id FOR UPDATE OF entry, asset`, [session.id]);
    const currentExpected = await client.query(
      `SELECT inventory.id, CASE WHEN inventory.tracking_type='bulk' THEN GREATEST(inventory.quantity+inventory.additional_qty-inventory.replaces-inventory.missing-inventory.breakage-inventory.defective-inventory.total_loss-inventory.borrowed_quantity,0)
        ELSE (SELECT count(*)::integer FROM public.inventory_assets asset WHERE asset.inventory_id=inventory.id AND asset.status IN ('available','maintenance')) END AS expected
       FROM public.inventory inventory WHERE inventory.id=ANY($1::bigint[])`, [items.rows.map((item) => item.inventory_id)]
    );
    const currentExpectedById = new Map(currentExpected.rows.map((item) => [String(item.id), Number(item.expected)]));
    if (items.rows.some((item) => currentExpectedById.get(String(item.inventory_id)) !== Number(item.expected_on_hand))) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "RECONCILIATION_SNAPSHOT_STALE", message: "Borrowing or inventory activity changed expected stock during this count. Cancel it and start a fresh physical count." });
    }
    if (assets.rows.some((asset) => asset.status !== asset.expected_status || asset.condition !== asset.expected_condition)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "RECONCILIATION_SNAPSHOT_STALE", message: "A serialized asset changed status or condition during this count. Cancel it and start a fresh physical count." });
    }
    await client.query(`UPDATE public.inventory_reconciliation_assets SET discrepancy_type='not_found' WHERE reconciliation_id=$1 AND scanned_at IS NULL AND expected_status IN ('available','maintenance')`, [session.id]);
    for (const asset of assets.rows) {
      if (!asset.scanned_at && ["available", "maintenance"].includes(asset.expected_status)) asset.discrepancy_type = "not_found";
    }
    const discrepancyCount = items.rows.filter((item) => Number(item.discrepancy) !== 0).length + assets.rows.filter((asset) => asset.discrepancy_type).length;
    if (discrepancyCount && (reason.length < 5 || reason.length > 1000)) { await client.query("ROLLBACK"); return res.status(422).json({ error: "ADJUSTMENT_REASON_REQUIRED", message: "Explain the discrepancies using 5 to 1000 characters." }); }
    if (apply) {
      for (const item of items.rows.filter((entry) => entry.tracking_type === "bulk" && Number(entry.discrepancy) !== 0)) {
        const inventory = inventoryById.get(String(item.inventory_id));
        const candidate = { ...inventory, quantity: Number(inventory.quantity) + Number(item.discrepancy) };
        const commitment = await loadInventoryCommitment(client, item.inventory_id);
        if (!commitment.valid || candidate.quantity < 0 || usableInventoryQuantity(candidate) < commitment.requiredCapacity) { await client.query("ROLLBACK"); return res.status(409).json({ error: "RECONCILIATION_COMMITMENT_CONFLICT", message: `Adjustment for inventory item '${item.inventory_id}' would violate active borrowing commitments.` }); }
        await client.query(`UPDATE public.inventory SET quantity=quantity+$2, updated_at=now() WHERE id=$1`, [item.inventory_id, item.discrepancy]);
      }
      for (const asset of assets.rows) {
        if (asset.discrepancy_type === "not_found") {
          const breakage = asset.status === "maintenance" && asset.condition === "damaged" ? -1 : 0;
          const defective = asset.status === "maintenance" && asset.condition !== "damaged" ? -1 : 0;
          const current = inventoryById.get(String(asset.inventory_id));
          const candidate = { ...current, missing: Number(current.missing) + 1, breakage: Number(current.breakage) + breakage, defective: Number(current.defective) + defective };
          const commitment = await loadInventoryCommitment(client, asset.inventory_id);
          if (!commitment.valid || candidate.breakage < 0 || candidate.defective < 0 || usableInventoryQuantity(candidate) < commitment.requiredCapacity) { await client.query("ROLLBACK"); return res.status(409).json({ error: "RECONCILIATION_COMMITMENT_CONFLICT", message: `Missing asset adjustment for inventory item '${asset.inventory_id}' would violate active commitments.` }); }
          const changed = await client.query(`UPDATE public.inventory SET missing=missing+1, breakage=breakage+$2, defective=defective+$3, updated_at=now() WHERE id=$1 AND breakage+$2>=0 AND defective+$3>=0 RETURNING *`, [asset.inventory_id, breakage, defective]);
          inventoryById.set(String(asset.inventory_id), changed.rows[0]);
          await client.query(`UPDATE public.inventory_assets SET status='missing', condition='missing', maintenance_note=$2, updated_at=now() WHERE id=$1`, [asset.asset_id, `Not located during reconciliation ${session.id}: ${reason}`]);
          await client.query(`UPDATE public.asset_maintenance_records SET status='completed', repair_notes=COALESCE(repair_notes || E'\n','') || $2, completed_by=$3, completed_at=now(), updated_at=now() WHERE asset_id=$1 AND status IN ('under_inspection','under_repair')`, [asset.asset_id, `Asset transferred to missing-asset investigation during reconciliation ${session.id}.`, req.user.id]);
        } else if (asset.discrepancy_type === "unexpected" && asset.status === "missing") {
          const maintenance = ["damaged", "under_inspection"].includes(asset.observed_condition);
          const changed = await client.query(`UPDATE public.inventory SET missing=missing-1, breakage=breakage+$2, defective=defective+$3, updated_at=now() WHERE id=$1 AND missing>0 RETURNING *`, [asset.inventory_id, asset.observed_condition === "damaged" ? 1 : 0, asset.observed_condition === "under_inspection" ? 1 : 0]);
          if (!changed.rowCount) throw new Error("Missing asset counters are inconsistent.");
          inventoryById.set(String(asset.inventory_id), changed.rows[0]);
          await client.query(`UPDATE public.inventory_assets SET status=$2, condition=$3, maintenance_note=NULL, updated_at=now() WHERE id=$1`, [asset.asset_id, maintenance ? "maintenance" : "available", asset.observed_condition]);
          if (maintenance) await client.query(`INSERT INTO public.asset_maintenance_records (asset_id,inventory_id,source,status,problem_description,opened_by) SELECT $1,$2,'reconciliation','under_inspection',$3,$4 WHERE NOT EXISTS (SELECT 1 FROM public.asset_maintenance_records WHERE asset_id=$1 AND status IN ('under_inspection','under_repair'))`, [asset.asset_id, asset.inventory_id, `Condition recorded as ${asset.observed_condition} during reconciliation ${session.id}.`, req.user.id]);
        } else if (asset.discrepancy_type === "condition_mismatch") {
          const oldBreakage = asset.status === "maintenance" && asset.condition === "damaged" ? 1 : 0;
          const oldDefective = asset.status === "maintenance" && asset.condition === "under_inspection" ? 1 : 0;
          const newBreakage = asset.observed_condition === "damaged" ? 1 : 0;
          const newDefective = asset.observed_condition === "under_inspection" ? 1 : 0;
          const current = inventoryById.get(String(asset.inventory_id));
          const candidate = { ...current, breakage: Number(current.breakage)+newBreakage-oldBreakage, defective: Number(current.defective)+newDefective-oldDefective };
          const commitment = await loadInventoryCommitment(client, asset.inventory_id);
          if (!commitment.valid || usableInventoryQuantity(candidate) < commitment.requiredCapacity) { await client.query("ROLLBACK"); return res.status(409).json({ error: "RECONCILIATION_COMMITMENT_CONFLICT", message: `Condition adjustment for inventory item '${asset.inventory_id}' would violate active commitments.` }); }
          const changed = await client.query(`UPDATE public.inventory SET breakage=breakage+$2, defective=defective+$3, updated_at=now() WHERE id=$1 AND breakage+$2>=0 AND defective+$3>=0 RETURNING *`, [asset.inventory_id, newBreakage-oldBreakage, newDefective-oldDefective]);
          if (!changed.rowCount) throw new Error("Serialized condition counters are inconsistent.");
          inventoryById.set(String(asset.inventory_id), changed.rows[0]);
          await client.query(`UPDATE public.inventory_assets SET condition=$2, status=CASE WHEN $2 IN ('damaged','under_inspection') THEN 'maintenance' ELSE 'available' END, updated_at=now() WHERE id=$1`, [asset.asset_id, asset.observed_condition]);
          if (newBreakage || newDefective) {
            await client.query(`INSERT INTO public.asset_maintenance_records (asset_id,inventory_id,source,status,problem_description,opened_by) SELECT $1,$2,'reconciliation','under_inspection',$3,$4 WHERE NOT EXISTS (SELECT 1 FROM public.asset_maintenance_records WHERE asset_id=$1 AND status IN ('under_inspection','under_repair'))`, [asset.asset_id, asset.inventory_id, `Condition changed to ${asset.observed_condition} during reconciliation ${session.id}.`, req.user.id]);
          } else if (oldBreakage || oldDefective) {
            await client.query(`UPDATE public.asset_maintenance_records SET status='completed', repair_notes=COALESCE(repair_notes || E'\n','') || $2, completed_by=$3, completed_at=now(), updated_at=now() WHERE asset_id=$1 AND status IN ('under_inspection','under_repair')`, [asset.asset_id, `Returned to service through reconciliation ${session.id}: ${reason}`, req.user.id]);
          }
        }
      }
    }
    const completed = await client.query(`UPDATE public.inventory_reconciliations SET status='completed', completed_by=$2, completed_at=now(), apply_adjustments=$3, adjustment_reason=$4 WHERE id=$1 RETURNING *`, [session.id, req.user.id, apply, reason || null]);
    await writeAuditLog(client, req.user, { action: "inventory_reconciliation_completed", entityType: "inventory_reconciliation", entityId: session.id, oldValues: { status: "in_progress" }, newValues: { status: "completed", applyAdjustments: apply, discrepancyCount, reason } });
    await client.query("COMMIT");
    return res.json(await sessionResponse(pool, completed.rows[0]));
  } catch (error) { await client.query("ROLLBACK"); return next(error); } finally { client.release(); }
}

async function cancelReconciliation(req, res, next) {
  if (!UUID.test(req.params.id)) return res.status(400).json({ error: "INVALID_RECONCILIATION_ID", message: "Reconciliation ID is invalid." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`UPDATE public.inventory_reconciliations SET status='cancelled', completed_by=$2, completed_at=now() WHERE id=$1 AND status='in_progress' RETURNING *`, [req.params.id, req.user.id]);
    if (!result.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: "RECONCILIATION_CLOSED", message: "This stocktake is not active." }); }
    await writeAuditLog(client, req.user, { action: "inventory_reconciliation_cancelled", entityType: "inventory_reconciliation", entityId: req.params.id });
    await client.query("COMMIT");
    return res.json({ session: result.rows[0] });
  } catch (error) { await client.query("ROLLBACK"); return next(error); } finally { client.release(); }
}

module.exports = { cancelReconciliation, completeReconciliation, createReconciliation, getActiveReconciliation, recordBulkCount, scanReconciliationAsset };
