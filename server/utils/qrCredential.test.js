"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAccountQr, createAssetQr, createClaimTicket, parseAccountQr, parseAssetQr, verifyClaimTicket } = require("./qrCredential");

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STAFF_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test.before(() => { process.env.QR_SIGNING_SECRET = "test-only-secret-that-is-at-least-32-characters"; });

test("creates and verifies a QR without embedding personal account data", () => {
  const publicId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const token = createAccountQr(publicId, 3);
  assert.deepEqual(parseAccountQr(token), { publicId, version: 3 });
  assert.equal(token.includes("student@example.com"), false);
  assert.equal(parseAccountQr(`${token.slice(0, -1)}x`), null);
});

test("claim tickets are bound to request, user, staff, and expiration", () => {
  const expiresAt = Date.now() + 60_000;
  const token = createClaimTicket({ requestId: 42, userId: USER_ID, staffId: STAFF_ID, qrVersion: 2, expiresAt });
  assert.equal(verifyClaimTicket(token, { requestId: 42, staffId: STAFF_ID }).userId, USER_ID);
  assert.equal(verifyClaimTicket(token, { requestId: 42, staffId: STAFF_ID }).qrVersion, 2);
  assert.equal(verifyClaimTicket(token, { requestId: 43, staffId: STAFF_ID }), null);
  assert.equal(verifyClaimTicket(token, { requestId: 42, staffId: USER_ID }), null);
  assert.equal(verifyClaimTicket(token, { requestId: 42, staffId: STAFF_ID, now: expiresAt + 1 }), null);
});

test("asset QR credentials use a distinct signed namespace", () => {
  const publicId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const token = createAssetQr(publicId, 2);
  assert.deepEqual(parseAssetQr(token), { publicId, version: 2 });
  assert.equal(parseAccountQr(token), null);
  assert.equal(parseAssetQr(`${token.slice(0, -1)}x`), null);
});

test("refuses to operate without a sufficiently strong signing secret", () => {
  const original = process.env.QR_SIGNING_SECRET;
  process.env.QR_SIGNING_SECRET = "short";
  assert.throws(() => createAccountQr(USER_ID, 1), { code: "QR_NOT_CONFIGURED" });
  process.env.QR_SIGNING_SECRET = original;
});
