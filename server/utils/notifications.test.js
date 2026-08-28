"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { notificationValues, notifyUser } = require("./notifications");

test("normalizes notification entity IDs", () => {
  assert.deepEqual(notificationValues({ type: "approved", title: "Approved", message: "Ready", entityId: 12 }),
    ["approved", "Approved", "Ready", null, null, "12"]);
});
test("does not create a notification without a recipient", async () => {
  let called = false;
  await notifyUser({ query: async () => { called = true; } }, null, { type: "x", title: "X", message: "X" });
  assert.equal(called, false);
});
