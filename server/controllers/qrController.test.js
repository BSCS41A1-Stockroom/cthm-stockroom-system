"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const pool = require("../config/db");
const { createAccountQr } = require("../utils/qrCredential");
const { createScannerPairing, lookupReadyRequest, submitPairedScan } = require("./qrController");

const STAFF_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STUDENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function responseRecorder() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
}

test.before(() => { process.env.QR_SIGNING_SECRET = "test-only-secret-that-is-at-least-32-characters"; });

test("creates a random five-minute pairing without exposing its stored hash", async (context) => {
  const originalQuery = pool.query;
  context.after(() => { pool.query = originalQuery; });
  const calls = [];
  pool.query = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes("INSERT INTO public.qr_scanner_sessions")) return { rowCount: 1, rows: [{ id: SESSION_ID, expires_at: "2026-09-15T12:05:00Z" }] };
    return { rowCount: 1, rows: [] };
  };
  const res = responseRecorder();
  await createScannerPairing({ user: { id: STAFF_ID, role: "admin" } }, res, assert.fail);
  assert.equal(res.statusCode, 201);
  assert.match(res.body.pairToken, new RegExp(`^pair\\.v1\\.${SESSION_ID}\\.[A-Za-z0-9_-]{43}$`));
  const insert = calls.find((call) => call.sql.includes("INSERT INTO public.qr_scanner_sessions"));
  assert.equal(insert.values[1].length, 64);
  assert.equal(res.body.pairToken.includes(insert.values[1]), false);
});

test("accepts one paired scan for the same staff account and stores no raw QR token", async (context) => {
  const originalConnect = pool.connect;
  context.after(() => { pool.connect = originalConnect; });
  const secret = crypto.randomBytes(32).toString("base64url");
  const secretHash = crypto.createHash("sha256").update(secret).digest("hex");
  const accountPublicId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const accountToken = createAccountQr(accountPublicId, 1);
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes("SELECT * FROM public.qr_scanner_sessions")) return { rowCount: 1, rows: [{ id: SESSION_ID, staff_user_id: STAFF_ID, secret_hash: secretHash, status: "connected", expires_at: new Date(Date.now() + 60_000).toISOString() }] };
      if (sql.includes("FROM public.profiles WHERE qr_public_id")) return { rowCount: 1, rows: [{ user_id: STUDENT_ID, full_name: "Student", student_id: "2026-001", role: "student", is_active: true, qr_version: 1, qr_revoked_at: null }] };
      if (sql.includes("FROM public.borrow_requests request")) return { rowCount: 1, rows: [{ id: 9, items: [] }] };
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  pool.connect = async () => client;
  const res = responseRecorder();
  await submitPairedScan({ user: { id: STAFF_ID, role: "admin" }, body: { pairToken: `pair.v1.${SESSION_ID}.${secret}`, accountToken } }, res, assert.fail);
  assert.equal(res.statusCode, 200);
  assert.match(res.body.message, /Continue on the paired PC/);
  assert.ok(calls.some((call) => call.sql.includes("SET status='scanned'")));
  assert.equal(calls.some((call) => call.values?.includes(accountToken)), false);
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
});

test("return-mode QR lookup returns only outstanding borrowed transactions", async (context) => {
  const originalQuery = pool.query;
  context.after(() => { pool.query = originalQuery; });
  const publicId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  pool.query = async (sql) => {
    if (sql.includes("FROM public.profiles WHERE qr_public_id")) return { rowCount: 1, rows: [{ user_id: STUDENT_ID, full_name: "Student", student_id: "2026-001", role: "student", is_active: true, qr_version: 1, qr_revoked_at: null }] };
    if (sql.includes("request.status='Borrowed'")) return { rowCount: 1, rows: [{ id: 14, return_date: "2026-09-20", items: [{ inventoryId: 2, quantity: 3, accountedQuantity: 1, outstandingQuantity: 2 }] }] };
    return { rowCount: 1, rows: [] };
  };
  const res = responseRecorder();
  await lookupReadyRequest({ user: { id: STAFF_ID, role: "admin" }, body: { token: createAccountQr(publicId, 1), mode: "return" } }, res, assert.fail);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mode, "return");
  assert.equal(res.body.requests[0].items[0].outstandingQuantity, 2);
});
