"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../config/db");
const { verifyReceipt } = require("./receiptController");

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("rejects malformed receipt verification codes without querying", async () => {
  const originalQuery = pool.query;
  let queried = false;
  pool.query = async () => { queried = true; };
  const res = response();
  try { await verifyReceipt({ params: { code: "not-a-code" } }, res, (error) => { throw error; }); }
  finally { pool.query = originalQuery; }
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.valid, false);
  assert.equal(queried, false);
});

test("public receipt verification returns authenticity data without personal details", async () => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rowCount: 1, rows: [{ receipt_number: "RCT-2030-00000001", receipt_type: "claim", request_id: 10, created_at: "2030-01-02T00:00:00Z" }] });
  const res = response();
  try { await verifyReceipt({ params: { code: "abcdef0123456789abcdef0123456789" } }, res, (error) => { throw error; }); }
  finally { pool.query = originalQuery; }
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.valid, true);
  assert.deepEqual(Object.keys(res.body.receipt).sort(), ["created_at", "receipt_number", "receipt_type", "request_id"]);
  assert.equal(JSON.stringify(res.body).includes("student"), false);
});
