"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  inventoryDeltas,
  loadValidationContext,
  normalizeRequest,
  withValidation,
} = require("./borrowController");

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

test("does not coerce boolean or composite quantities into numbers", () => {
  const request = normalizeRequest({
    items: [
      { inventoryId: 1, quantity: true },
      { inventoryId: 2, quantity: [2] },
      { inventoryId: 3, quantity: "2" },
    ],
  });

  assert.equal(Number.isNaN(request.items[0].quantity), true);
  assert.equal(Number.isNaN(request.items[1].quantity), true);
  assert.equal(request.items[2].quantity, 2);
});

test("normalizes an absent body and null item without throwing", () => {
  assert.deepEqual(normalizeRequest(undefined).items, []);
  const request = normalizeRequest({ items: [null] });
  assert.equal(request.items[0].inventoryId, undefined);
  assert.equal(Number.isNaN(request.items[0].quantity), true);
});

test("loads conflict context under a normalized student advisory lock", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes("FROM inventory")) return { rows: [{ id: 7, item_name: "Pan", quantity: 5 }] };
      if (sql.includes("COALESCE(SUM")) return { rows: [{ inventory_id: 7, quantity: 2 }] };
      if (sql.includes("FROM borrow_requests br")) return {
        rows: [
          { id: 9, student_id: "Student-1", borrow_date: "2026-08-10", return_date: "2026-08-12", status: "Pending", inventory_id: 7, quantity: 1 },
          { id: 9, student_id: "Student-1", borrow_date: "2026-08-10", return_date: "2026-08-12", status: "Pending", inventory_id: 8, quantity: 2 },
        ],
      };
      return { rows: [] };
    },
  };

  const context = await loadValidationContext(client, {
    studentId: " STUDENT-1 ",
    borrowDate: "2026-08-10",
    returnDate: "2026-08-12",
    items: [{ inventoryId: 7, quantity: 1 }],
  });

  assert.match(calls[0].sql, /pg_advisory_xact_lock/);
  assert.equal(calls[0].params[0], "student-1");
  assert.match(calls.find((call) => call.sql.includes("COALESCE(SUM")).sql, /::bigint/);
  assert.match(calls.find((call) => call.sql.includes("COALESCE(SUM")).sql, /has_invalid_quantity/);
  assert.deepEqual(context.existingBorrowings, [{ inventoryId: 7, quantity: 2 }]);
  assert.deepEqual(context.existingRequests[0].items, [
    { inventoryId: 7, quantity: 1 },
    { inventoryId: 8, quantity: 2 },
  ]);
});

test("rolls back a duplicate before any borrowing or inventory write", async () => {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes("FROM inventory")) return {
        rows: [{ id: 7, item_name: "Pan", quantity: 5, additional_qty: 0, replaces: 0, missing: 0, breakage: 0, defective: 0, total_loss: 0 }],
      };
      if (sql.includes("COALESCE(SUM")) return { rows: [{ inventory_id: 7, quantity: "1" }] };
      if (sql.includes("FROM borrow_requests br")) return {
        rows: [{
          id: 99,
          student_id: "STUDENT-1",
          borrow_date: "2026-08-10",
          return_date: "2026-08-12",
          status: "Pending",
          inventory_id: 7,
          quantity: 1,
        }],
      };
      return { rows: [] };
    },
    release() {},
  };
  const databasePool = { async connect() { return client; } };

  const result = await withValidation({
    studentName: "Student One",
    studentId: "student-1",
    borrowDate: "2026-08-10",
    returnDate: "2026-08-12",
    purpose: "Laboratory",
    items: [{ inventoryId: 7, quantity: 1 }],
  }, true, databasePool);

  assert.equal(result.validation.valid, false);
  assert.equal(result.validation.conflicts[0].code, "DUPLICATE_BORROWING_REQUEST");
  assert.equal(statements.at(-1), "ROLLBACK");
  assert.equal(statements.some((sql) => /^\s*(INSERT|UPDATE)/.test(sql)), false);
});
