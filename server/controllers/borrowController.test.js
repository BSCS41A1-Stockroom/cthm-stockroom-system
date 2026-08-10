"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeRequest } = require("./borrowController");

test("normalizes camelCase API payloads", () => {
  assert.deepEqual(normalizeRequest({
    borrowDate: "2026-08-10",
    returnDate: "2026-08-11",
    purpose: "Lab",
    items: [{ inventoryId: 7, quantity: "2" }],
  }), {
    borrowDate: "2026-08-10",
    returnDate: "2026-08-11",
    purpose: "Lab",
    items: [{ inventoryId: 7, quantity: 2 }],
  });
});

test("normalizes snake_case database-style payloads", () => {
  assert.deepEqual(normalizeRequest({
    borrow_date: "2026-08-10",
    return_date: "2026-08-11",
    purpose: "Lab",
    items: [{ inventory_id: 7, quantity: 2 }],
  }), {
    borrowDate: "2026-08-10",
    returnDate: "2026-08-11",
    purpose: "Lab",
    items: [{ inventoryId: 7, quantity: 2 }],
  });
});
