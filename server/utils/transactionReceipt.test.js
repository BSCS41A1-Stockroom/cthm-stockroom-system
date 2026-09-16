"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createTransactionReceipt } = require("./transactionReceipt");

test("creates a parameterized immutable claim receipt snapshot", async () => {
  const calls = [];
  const receipt = { id: 4, receipt_number: "RCT-2026-00000004", receipt_type: "claim" };
  const client = { async query(sql, params) { calls.push({ sql, params }); return { rowCount: 1, rows: [receipt] }; } };
  assert.equal(await createTransactionReceipt(client, { requestId: 9, receiptType: "claim", createdBy: "admin" }), receipt);
  assert.match(calls[0].sql, /INSERT INTO public\.transaction_receipts/);
  assert.deepEqual(calls[0].params, [9, "claim", null, "admin"]);
});

test("rejects inconsistent receipt references before querying", async () => {
  const client = { async query() { assert.fail("database should not be queried"); } };
  await assert.rejects(() => createTransactionReceipt(client, { requestId: 1, receiptType: "return" }), TypeError);
  await assert.rejects(() => createTransactionReceipt(client, { requestId: 1, receiptType: "claim", returnId: 2 }), TypeError);
});
