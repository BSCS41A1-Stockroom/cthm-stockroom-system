"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { decodeSignature, ownershipError } = require("./authorizationController");

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
