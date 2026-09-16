"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../config/db");
const { cancelReconciliation, recordBulkCount, scanReconciliationAsset } = require("./reconciliationController");

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("rejects invalid physical counts before querying the database", async () => {
  const res = response();
  await recordBulkCount({ params: { id: "bad", inventoryId: "1" }, body: { count: -1 } }, res, (error) => { throw error; });
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.error, "INVALID_COUNT");
});

test("rejects malformed reconciliation asset QR scans", async () => {
  const res = response();
  await scanReconciliationAsset({ params: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, body: { token: "not-a-qr", condition: "good" }, user: { id: "admin" } }, res, (error) => { throw error; });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, "INVALID_ASSET_QR");
});

test("cancels a stocktake and writes its audit record atomically", async () => {
  const calls = [];
  const client = { async query(sql) {
    calls.push(sql);
    if (sql.includes("UPDATE public.inventory_reconciliations")) return { rowCount: 1, rows: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "cancelled" }] };
    return { rowCount: 1, rows: [] };
  }, release() {} };
  const originalConnect = pool.connect; pool.connect = async () => client;
  const res = response();
  try {
    await cancelReconciliation({ params: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, user: { id: "admin", role: "admin" } }, res, (error) => { throw error; });
  } finally { pool.connect = originalConnect; }
  assert.equal(res.statusCode, 200);
  assert.ok(calls.some((sql) => sql.includes("INSERT INTO public.audit_logs")));
  assert.equal(calls.at(-1), "COMMIT");
});
