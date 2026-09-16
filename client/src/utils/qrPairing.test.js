import test from "node:test";
import assert from "node:assert/strict";
import { pairedTransactionReady } from "./qrPairing.js";

test("recognizes completed claim and return pairing responses", () => {
  assert.equal(pairedTransactionReady({ request: { id: 1 } }), true);
  assert.equal(pairedTransactionReady({ mode: "return", requests: [{ id: 2 }] }), true);
  assert.equal(pairedTransactionReady({ mode: "return", requests: [] }), true);
});

test("keeps waiting for pairing status-only responses", () => {
  assert.equal(pairedTransactionReady({ status: "waiting" }), false);
  assert.equal(pairedTransactionReady({ status: "connected" }), false);
  assert.equal(pairedTransactionReady(null), false);
});
