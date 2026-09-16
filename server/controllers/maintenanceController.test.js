"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../config/db");
const { maintenanceErrors, normalizeMaintenanceUpdate, updateAssetMaintenance } = require("./maintenanceController");

test("normalizes a valid maintenance progress update", () => {
  const update = normalizeMaintenanceUpdate({ status: "under_repair", repairNotes: " Replaced damaged cable. ", dueDate: "2026-10-20", cost: "1250.50" });
  assert.deepEqual(update, { status: "under_repair", repairNotes: "Replaced damaged cable.", dueDate: "2026-10-20", cost: 1250.5 });
  assert.deepEqual(maintenanceErrors(update), []);
});

test("requires meaningful closure notes and rejects unsafe values", () => {
  const errors = maintenanceErrors(normalizeMaintenanceUpdate({ status: "completed", repairNotes: "ok", dueDate: "2026-02-30", cost: -1 }));
  assert.equal(errors.some((error) => error.includes("valid maintenance due date")), true);
  assert.equal(errors.some((error) => error.includes("non-negative")), true);
  assert.equal(errors.some((error) => error.includes("at least 5")), true);
});

test("rejects unknown workflow states and non-numeric costs", () => {
  const errors = maintenanceErrors(normalizeMaintenanceUpdate({ status: "available", cost: "free" }));
  assert.equal(errors.some((error) => error.includes("valid maintenance status")), true);
  assert.equal(errors.some((error) => error.includes("non-negative")), true);
});

test("returns a repaired asset to service and closes its case atomically", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes("SELECT * FROM public.inventory WHERE")) return { rowCount: 1, rows: [{ id: 7, quantity: 5, additional_qty: 0, replaces: 0, missing: 0, breakage: 1, defective: 0, total_loss: 0 }] };
      if (sql.includes("SELECT * FROM public.inventory_assets")) return { rowCount: 1, rows: [{ id: 9, inventory_id: 7, status: "maintenance", condition: "damaged" }] };
      if (sql.includes("SELECT * FROM public.asset_maintenance_records")) return { rowCount: 1, rows: [{ id: 3, asset_id: 9, inventory_id: 7, status: "under_repair", problem_description: "Broken cable" }] };
      if (sql.includes("WITH returned AS")) return { rows: [{ borrowed: 0, scheduled_peak: 0, has_invalid_quantity: false }] };
      if (sql.includes("UPDATE public.inventory SET")) return { rowCount: 1, rows: [{ id: 7 }] };
      if (sql.includes("UPDATE public.asset_maintenance_records")) return { rowCount: 1, rows: [{ id: 3, asset_id: 9, inventory_id: 7, status: "completed", cost: "250", repair_notes: "Cable replaced", completed_at: "2026-09-16T00:00:00Z" }] };
      return { rowCount: 1, rows: [] };
    }, release() {},
  };
  const originalConnect = pool.connect;
  pool.connect = async () => client;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  try {
    await updateAssetMaintenance({ params: { inventoryId: "7", assetId: "9", maintenanceId: "3" }, body: { status: "completed", repairNotes: "Cable replaced", cost: 250 }, user: { id: "admin", role: "admin", full_name: "Admin" } }, response, (error) => { throw error; });
  } finally { pool.connect = originalConnect; }
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.maintenance.status, "completed");
  assert.deepEqual(calls.find((call) => call.sql.includes("UPDATE public.inventory SET")).params, ["7", 0, 1, 0]);
  assert.ok(calls.some((call) => call.sql.includes("UPDATE public.inventory_assets SET status=$2") && call.params[1] === "available"));
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO public.audit_logs")));
  assert.equal(calls.at(-1).sql, "COMMIT");
});
