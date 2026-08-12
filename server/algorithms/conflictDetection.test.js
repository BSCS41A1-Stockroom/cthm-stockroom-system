"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ACTIVE_BORROWING_STATUSES,
  datesOverlap,
  detectBorrowingConflicts,
  itemSignature,
} = require("./conflictDetection");

const request = {
  studentId: "2026-0001",
  borrowDate: "2026-08-10",
  returnDate: "2026-08-12",
  items: [{ inventoryId: 2, quantity: 1 }, { inventoryId: 1, quantity: 3 }],
};

test("publishes the active status policy used by database and pure checks", () => {
  assert.deepEqual(ACTIVE_BORROWING_STATUSES, ["Pending", "Validated", "Approved", "Borrowed"]);
  assert.equal(Object.isFrozen(ACTIVE_BORROWING_STATUSES), true);
});

test("treats borrowing date ranges as inclusive", () => {
  assert.equal(datesOverlap(request, { borrowDate: "2026-08-12", returnDate: "2026-08-13" }), true);
  assert.equal(datesOverlap(request, { borrowDate: "2026-08-13", returnDate: "2026-08-14" }), false);
});

test("canonicalizes item sets independent of their order", () => {
  assert.equal(itemSignature([...request.items].reverse()), itemSignature(request.items));
});

test("canonical item signatures cannot collide through identifier delimiters", () => {
  const left = [{ inventoryId: "a:1|b", quantity: 2 }];
  const right = [{ inventoryId: "a", quantity: 1 }, { inventoryId: "b", quantity: 2 }];
  assert.notEqual(itemSignature(left), itemSignature(right));
});

test("canonicalizes legacy duplicate item rows by combined quantity", () => {
  assert.equal(
    itemSignature([{ inventoryId: 1, quantity: 1 }, { inventoryId: 1, quantity: 2 }]),
    itemSignature([{ inventoryId: 1, quantity: 3 }])
  );
});

test("detects an active duplicate without also reporting it as a schedule overlap", () => {
  const conflicts = detectBorrowingConflicts({
    request,
    existingRequests: [{ ...request, id: 41, status: "Pending", items: [...request.items].reverse() }],
    validation: { reasons: [] },
  });

  assert.deepEqual(conflicts.map((conflict) => conflict.code), ["DUPLICATE_BORROWING_REQUEST"]);
});

test("detects overlapping requests for the same student", () => {
  const conflicts = detectBorrowingConflicts({
    request,
    existingRequests: [{
      ...request,
      id: 42,
      status: "Approved",
      borrowDate: "2026-08-12",
      returnDate: "2026-08-15",
      items: [{ inventoryId: 9, quantity: 1 }],
    }],
    validation: { reasons: [] },
  });

  assert.equal(conflicts[0].code, "BORROWING_SCHEDULE_OVERLAP");
});

test("ignores terminal or non-overlapping requests", () => {
  const conflicts = detectBorrowingConflicts({
    request,
    existingRequests: [
      { ...request, id: 43, status: "Returned" },
      { ...request, id: 44, status: "Rejected" },
      { ...request, id: 45, status: "Pending", borrowDate: "2026-08-13", returnDate: "2026-08-14" },
      { ...request, id: 46, studentId: "2026-9999", status: "Pending" },
    ],
    validation: { reasons: [] },
  });

  assert.deepEqual(conflicts, []);
});

test("promotes insufficient inventory validation failures to conflicts", () => {
  const reason = { code: "INSUFFICIENT_INVENTORY", inventoryId: "1", availableQuantity: 2 };
  const conflicts = detectBorrowingConflicts({ request, validation: { reasons: [reason] } });
  assert.deepEqual(conflicts, [reason]);
});
