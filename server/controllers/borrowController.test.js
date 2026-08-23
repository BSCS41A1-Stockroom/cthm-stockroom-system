"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  inventoryDeltas,
  loadValidationContext,
  normalizeRequest,
  serializeBorrowRequest,
  validatePolicyConstraints,
  withValidation,
} = require("./borrowController");

const ALL_POLICY_CONSTRAINTS = [
  "inventory_capacity",
  "time_overlap",
  "duplicate_request",
  "borrowing_limit",
  "lead_time",
  "return_outstanding",
  "status",
  "availability_date",
];

function policyFixture(overrides = {}) {
  return {
    request: {
      studentName: "Student One",
      studentId: "STUDENT-1",
      borrowDate: "2026-09-10",
      returnDate: "2026-09-11",
      purpose: "Laboratory",
      items: [{ inventoryId: 7, quantity: 2 }],
    },
    inventory: [{
      id: 7,
      item_name: "Pan",
      quantity: 20,
      additional_qty: 0,
      replaces: 0,
      missing: 0,
      breakage: 0,
      defective: 0,
      total_loss: 0,
    }],
    existingBorrowings: [],
    existingRequests: [],
    inventoryAvailability: { 7: ["2026-09-10"] },
    now: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

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

test("serializes database borrowing rows for the student request page", () => {
  assert.deepEqual(serializeBorrowRequest({
    id: 12,
    student_name: "Student One",
    student_id: "2026-001",
    borrow_date: "2026-08-20",
    return_date: "2026-08-21",
    purpose: "Lab",
    status: "Borrowed",
    created_at: "2026-08-19T00:00:00Z",
    items: [{ name: "Pan", quantity: 2 }],
  }), {
    id: 12,
    studentName: "Student One",
    studentId: "2026-001",
    borrowDate: "2026-08-20",
    returnDate: "2026-08-21",
    purpose: "Lab",
    status: "borrowed",
    requestedAt: "2026-08-19T00:00:00Z",
    items: [{ name: "Pan", quantity: 2 }],
  });
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

test("runs all eight borrowing-policy constraints for a valid request", () => {
  const validation = validatePolicyConstraints(policyFixture());

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.checkedConstraints, ALL_POLICY_CONSTRAINTS);
  assert.deepEqual(validation.reasons, []);
});

test("maps every borrowing-policy violation to a stable API reason code", () => {
  const cases = [
    {
      code: "INSUFFICIENT_INVENTORY",
      overrides: { inventory: [{ ...policyFixture().inventory[0], quantity: 1 }] },
    },
    {
      code: "TIME_OVERLAP",
      overrides: {
        existingRequests: [{
          id: 10,
          studentId: "STUDENT-1",
          borrowDate: "2026-09-11",
          returnDate: "2026-09-12",
          purpose: "Other class",
          status: "Approved",
          items: [{ inventoryId: 7, quantity: 1 }],
        }],
      },
    },
    {
      code: "DUPLICATE_BORROWING_REQUEST",
      overrides: {
        existingRequests: [{
          id: 11,
          studentId: " student-1 ",
          borrowDate: "2026-09-10",
          returnDate: "2026-09-11",
          purpose: "Laboratory",
          status: "Pending",
          items: [{ inventoryId: 7, quantity: 2 }],
        }],
      },
    },
    {
      code: "BORROWING_LIMIT_EXCEEDED",
      overrides: {
        request: { ...policyFixture().request, items: [{ inventoryId: 7, quantity: 11 }] },
      },
    },
    {
      code: "LEAD_TIME_NOT_MET",
      overrides: { now: new Date("2026-09-09T00:00:00Z") },
    },
    {
      code: "OUTSTANDING_BORROWING",
      overrides: {
        existingRequests: [{
          id: 12,
          studentId: "STUDENT-1",
          borrowDate: "2026-08-01",
          returnDate: "2026-08-02",
          purpose: "Earlier class",
          status: "Borrowed",
          items: [{ inventoryId: 7, quantity: 1 }],
        }],
      },
    },
    {
      code: "ACTIVE_REQUEST_CONFLICT",
      overrides: {
        existingRequests: [{
          id: 13,
          studentId: "STUDENT-1",
          borrowDate: "2026-09-10",
          returnDate: "2026-09-12",
          purpose: "Another class",
          status: "Validated",
          items: [{ inventoryId: 7, quantity: 1 }],
        }],
      },
    },
    {
      code: "INVENTORY_DATE_UNAVAILABLE",
      overrides: { inventoryAvailability: { 7: ["2026-09-12"] } },
    },
  ];

  for (const { code, overrides } of cases) {
    const validation = validatePolicyConstraints(policyFixture(overrides));
    assert.equal(
      validation.reasons.some((reason) => reason.code === code),
      true,
      `Expected ${code}`
    );
  }
});

test("commits a valid request only after all policy constraints pass", async () => {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes("FROM inventory")) return { rows: policyFixture().inventory };
      if (sql.includes("COALESCE(SUM")) return { rows: [] };
      if (sql.includes("FROM borrow_requests br")) return { rows: [] };
      if (sql.includes("INSERT INTO borrow_requests")) return { rows: [{ id: 101 }] };
      return { rows: [] };
    },
    release() {},
  };

  const result = await withValidation(
    policyFixture().request,
    true,
    { async connect() { return client; } },
    {
      now: policyFixture().now,
      inventoryAvailability: policyFixture().inventoryAvailability,
    }
  );

  assert.equal(result.validation.valid, true);
  assert.equal(result.validation.status, "Validated");
  assert.deepEqual(
    ALL_POLICY_CONSTRAINTS.every((constraint) =>
      result.validation.checkedConstraints.includes(constraint)),
    true
  );
  assert.equal(statements.at(-1), "COMMIT");
});

test("rolls back a lead-time violation before any data write", async () => {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes("FROM inventory")) return { rows: policyFixture().inventory };
      if (sql.includes("COALESCE(SUM")) return { rows: [] };
      if (sql.includes("FROM borrow_requests br")) return { rows: [] };
      return { rows: [] };
    },
    release() {},
  };

  const result = await withValidation(
    policyFixture().request,
    true,
    { async connect() { return client; } },
    { now: new Date("2026-09-09T00:00:00Z") }
  );

  assert.equal(result.validation.valid, false);
  assert.equal(
    result.validation.reasons.some((reason) => reason.code === "LEAD_TIME_NOT_MET"),
    true
  );
  assert.equal(statements.at(-1), "ROLLBACK");
  assert.equal(statements.some((sql) => /^\s*(INSERT|UPDATE)/.test(sql)), false);
});
