"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../config/db");
const { decodeSignature, ownershipError, saveMyAdminSignature, saveMyCustodianSignature } = require("./authorizationController");

test("accepts real image signatures and rejects disguised or oversized data", () => {
  const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  const parsed = decodeSignature(`data:image/png;base64,${png.toString("base64")}`);
  assert.equal(parsed.mimeType, "image/png");
  assert.equal(parsed.data.equals(png), true);
  assert.match(parsed.imageHash, /^[0-9a-f]{64}$/);
  assert.equal(decodeSignature(`data:image/jpeg;base64,${png.toString("base64")}`), null);
  assert.equal(decodeSignature("data:text/plain;base64,dGVzdA=="), null);
});

test("allows only the assigned professor to access an authorization", () => {
  const assigned = "00000000-0000-4000-8000-000000000001";
  assert.equal(ownershipError({ assigned_professor_user_id: assigned }, assigned), null);
  assert.equal(ownershipError({ assigned_professor_user_id: null }, assigned).error, "PROFESSOR_NOT_ASSIGNED");
  assert.equal(ownershipError({ assigned_professor_user_id: "00000000-0000-4000-8000-000000000002" }, assigned).error, "NOT_ASSIGNED_PROFESSOR");
  assert.equal(ownershipError(null, assigned).error, "REVIEW_NOT_FOUND");
});

test("saves a custodian signature under only the authenticated staff account and audits its hash", async () => {
  const png = Buffer.from([137,80,78,71,13,10,26,10,0]);
  const calls = [];
  const client = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes("SELECT image_hash")) return { rowCount: 0, rows: [] };
    return { rowCount: 1, rows: [] };
  }, release() {} };
  const originalConnect = pool.connect;
  pool.connect = async () => client;
  const response = { statusCode: 200, status(code) { this.statusCode=code; return this; }, json(body) { this.body=body; return this; } };
  try {
    await saveMyCustodianSignature({ user: { id: "staff-user", role: "staff" }, body: { image: `data:image/png;base64,${png.toString("base64")}` } }, response, (error) => { throw error; });
  } finally { pool.connect = originalConnect; }
  const upsert = calls.find((call) => call.sql.includes("INSERT INTO public.custodian_signatures"));
  assert.equal(upsert.params[0], "staff-user");
  assert.match(upsert.params[3], /^[0-9a-f]{64}$/);
  assert.equal(calls.some((call) => call.sql.includes("INSERT INTO public.audit_logs")), true);
  assert.equal(calls.at(-1).sql, "COMMIT");
  assert.equal(response.body.configured, true);
});

test("rejects an invalid custodian signature before accessing the database", async () => {
  const originalConnect = pool.connect;
  pool.connect = async () => assert.fail("database should not be accessed");
  const response = { statusCode: 200, status(code) { this.statusCode=code; return this; }, json(body) { this.body=body; return this; } };
  try { await saveMyCustodianSignature({ user: { id: "staff-user", role: "staff" }, body: { image: "not-an-image" } }, response, (error) => { throw error; }); }
  finally { pool.connect = originalConnect; }
  assert.equal(response.statusCode, 422);
  assert.equal(response.body.error, "INVALID_SIGNATURE");
});

test("saves an administrator signature under only the authenticated admin account", async () => {
  const png = Buffer.from([137,80,78,71,13,10,26,10,0]);
  const calls = [];
  const client = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes("SELECT image_hash")) return { rowCount: 0, rows: [] };
    return { rowCount: 1, rows: [] };
  }, release() {} };
  const originalConnect = pool.connect;
  pool.connect = async () => client;
  const response = { statusCode: 200, status(code) { this.statusCode=code; return this; }, json(body) { this.body=body; return this; } };
  try {
    await saveMyAdminSignature({ user: { id: "admin-user", role: "admin" }, body: { image: `data:image/png;base64,${png.toString("base64")}` } }, response, (error) => { throw error; });
  } finally { pool.connect = originalConnect; }
  const upsert = calls.find((call) => call.sql.includes("INSERT INTO public.admin_signatures"));
  assert.equal(upsert.params[0], "admin-user");
  assert.match(upsert.params[3], /^[0-9a-f]{64}$/);
  assert.equal(calls.some((call) => call.sql.includes("INSERT INTO public.audit_logs")), true);
  assert.equal(calls.at(-1).sql, "COMMIT");
  assert.equal(response.body.configured, true);
});
