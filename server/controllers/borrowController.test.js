"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { inventoryDeltas, normalizeRequest } = require("./borrowController");

test("normalizes camelCase API payloads", () => {
  assert.deepEqual(normalizeRequest({
    studentName: "Juan Dela Cruz",
    studentId: "2026-0001",
    borrowDate: "2026-08-10",
    returnDate: "2026-08-11",
    purpose: "Lab",
    items: [{ inventoryId: 7, quantity: "2" }],
  }), {
    studentName: "Juan Dela Cruz",
    studentId: "2026-0001",
    borrowDate: "2026-08-10",
    returnDate: "2026-08-11",
    purpose: "Lab",
    items: [{ inventoryId: 7, quantity: 2 }],
  });
});

test("normalizes snake_case database-style payloads", () => {
  assert.deepEqual(normalizeRequest({
    student_name: "Juan Dela Cruz",
    student_id: "2026-0001",
    borrow_date: "2026-08-10",
    return_date: "2026-08-11",
    purpose: "Lab",
    items: [{ inventory_id: 7, quantity: 2 }],
  }), {
    studentName: "Juan Dela Cruz",
    studentId: "2026-0001",
    borrowDate: "2026-08-10",
    returnDate: "2026-08-11",
    purpose: "Lab",
    items: [{ inventoryId: 7, quantity: 2 }],
  });
});

test("calculates inventory counter changes for request lifecycle transitions", () => {
  assert.deepEqual(inventoryDeltas("Pending", "Approved", 3), { reserved: 0, borrowed: 0 });
  assert.deepEqual(inventoryDeltas("Approved", "Borrowed", 3), { reserved: -3, borrowed: 3 });
  assert.deepEqual(inventoryDeltas("Borrowed", "Returned", 3), { reserved: 0, borrowed: -3 });
  assert.deepEqual(inventoryDeltas("Pending", "Rejected", 3), { reserved: -3, borrowed: 0 });
});
