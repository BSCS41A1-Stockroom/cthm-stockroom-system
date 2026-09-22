"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../config/db");
const {
  authenticatedStudentRequest,
  cancelBorrowRequest,
  getBorrowingPolicy,
  inventoryDeltas,
  loadValidationContext,
  normalizeRequest,
  normalizeReturn,
  processBorrowingReturn,
  rescheduleBorrowRequest,
  returnErrors,
  serializeBorrowRequest,
  updateBorrowRequestStatus,
  validateClaimWindow,
  validateAcademicAssignment,
  validatePolicyConstraints,
  withValidation,
} = require("./borrowController");

test("rescheduling rejects invalid dates and missing signature consent before touching the database", async () => {
  const response = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await rescheduleBorrowRequest({ params: { id: "1" }, body: { borrowDate: "bad", returnDate: "2026-10-03" } }, response, (error) => { throw error; });
  assert.equal(response.statusCode, 422);
  await rescheduleBorrowRequest({ params: { id: "1" }, body: { borrowDate: "2026-10-02", returnDate: "2026-10-03" } }, response, (error) => { throw error; });
  assert.equal(response.statusCode, 422);
  assert.match(response.body.message, /signature/i);
});

test("allows approved requests to be claimed early but not after their deadline", () => {
  assert.equal(validateClaimWindow("2026-10-17", "2026-09-18"), null);
  assert.equal(validateClaimWindow("2026-09-18", "2026-09-18"), null);
  assert.equal(validateClaimWindow("2026-09-17", "2026-09-18").error, "CLAIM_WINDOW_EXPIRED");
});

test("exposes the authoritative borrowing limits to the student form", () => {
  const response = { json(body) { this.body = body; return this; } };
  getBorrowingPolicy({}, response);
  assert.deepEqual(response.body, {
    maxItemsPerRequest: 10,
    maxQuantityPerRequest: 10,
    leadTimeDays: 2,
  });
});

test("accepts only an active professor and section from the selected department", async () => {
  const professorId = "00000000-0000-4000-8000-000000000004";
  const validClient = { query: async (sql, params) => { assert.match(sql, /professor\.role='professor'/); assert.deepEqual(params, ["2", "3", professorId]); return { rowCount: 1 }; } };
  assert.equal(await validateAcademicAssignment(validClient, { departmentId: 2, sectionId: 3, assignedProfessorId: professorId }), null);
  const invalidClient = { query: async () => ({ rowCount: 0 }) };
  assert.equal((await validateAcademicAssignment(invalidClient, { departmentId: 2, sectionId: 99, assignedProfessorId: professorId })).code, "INVALID_ACADEMIC_ASSIGNMENT");
  assert.equal((await validateAcademicAssignment(invalidClient, { departmentId: 2, sectionId: 3, assignedProfessorId: "typed name" })).code, "ACADEMIC_ASSIGNMENT_REQUIRED");
});

test("normalizes return quantities and rejects invalid return batches", () => {
  const valid = normalizeReturn({ remarks: " Checked ", items: [{ inventory_id: 7, good_quantity: "2", damaged_quantity: 1, missing_quantity: 0, condition_note: "Bent handle" }] });
  assert.equal(valid.remarks, "Checked");
  assert.equal(valid.items[0].goodQuantity, 2);
  assert.deepEqual(returnErrors(valid), []);
  assert.equal(returnErrors(normalizeReturn({ items: [{ inventoryId: 7, damagedQuantity: 1 }] })).some((error) => error.includes("condition note")), true);

  const duplicate = normalizeReturn({ items: [
    { inventoryId: 7, goodQuantity: 1 }, { inventoryId: 7, missingQuantity: 1 },
  ] });
  assert.equal(returnErrors(duplicate).some((error) => error.includes("appears more than once")), true);
  assert.equal(returnErrors(normalizeReturn({ items: [{ inventoryId: 7 }] })).includes("At least one unit must be accounted for."), true);
});

test("validates identified serialized missing-asset incident details", () => {
  const valid = normalizeReturn({
    items: [{ inventoryId: 7, missingQuantity: 1, conditionNote: "Asset not surrendered" }],
    missingAssets: [{ assetId: 42, reason: "Borrower could not surrender the assigned unit." }],
  });
  assert.deepEqual(returnErrors(valid), []);
  assert.equal(returnErrors(normalizeReturn({ items: [{ inventoryId: 7, missingQuantity: 1, conditionNote: "Missing" }], missingAssets: [{ assetId: 42, reason: "No" }] })).some((error) => error.includes("5 to 500")), true);
});

test("direct status approval is blocked in favor of signed custodian workflow", async () => {
  const calls = [];
  const client = { async query(sql) {
    calls.push(sql);
    if (sql.includes("SELECT * FROM borrow_requests")) return { rowCount: 1, rows: [{ id: 5, status: "Validated", user_id: "student", student_name: "Student", borrow_date: "2030-01-01", return_date: "2030-01-02" }] };
    if (sql.includes("SELECT inventory_id, quantity")) return { rowCount: 0, rows: [] };
    if (sql.includes("UPDATE borrow_requests")) return { rowCount: 1, rows: [{ id: 5, status: "Approved" }] };
    return { rowCount: 1, rows: [] };
  }, release() {} };
  const originalConnect = pool.connect; pool.connect = async () => client;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  try { await updateBorrowRequestStatus({ params: { id: "5" }, body: { status: "Approved" }, user: { id: "admin", role: "admin" } }, response, (error) => { throw error; }); }
  finally { pool.connect = originalConnect; }
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.error, "CUSTODIAN_WORKFLOW_REQUIRED");
  assert.equal(calls.some((sql) => sql.includes("borrowing_asset_assignments")), false);
  assert.equal(calls.at(-1), "ROLLBACK");
});

test("department staff cannot bypass signed custodian approval", async () => {
  const calls = [];
  const client = { async query(sql) {
    calls.push(sql);
    if (/FROM borrow_requests\s+WHERE id/i.test(sql)) return { rowCount: 1, rows: [{ id: 6, status: "Validated", department_id: 4, user_id: "student", student_name: "Student", borrow_date: "2030-01-01", return_date: "2030-01-02" }] };
    if (sql.includes("SELECT inventory_id, quantity")) return { rowCount: 0, rows: [] };
    if (sql.includes("UPDATE borrow_requests")) return { rowCount: 1, rows: [{ id: 6, status: "Approved" }] };
    return { rowCount: 1, rows: [] };
  }, release() {} };
  const originalConnect = pool.connect; pool.connect = async () => client;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  try { await updateBorrowRequestStatus({ params: { id: "6" }, body: { status: "Approved" }, user: { id: "staff", role: "staff", department_id: 4 } }, response, (error) => { throw error; }); }
  finally { pool.connect = originalConnect; }
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.error, "CUSTODIAN_WORKFLOW_REQUIRED");
  assert.equal(calls.at(-1), "ROLLBACK");
});

test("department staff cannot update another department's request", async () => {
  const client = { async query(sql) {
    if (/FROM borrow_requests\s+WHERE id/i.test(sql)) return { rowCount: 1, rows: [{ id: 7, status: "Validated", department_id: 9 }] };
    return { rowCount: 1, rows: [] };
  }, release() {} };
  const originalConnect = pool.connect; const originalQuery = pool.query;
  pool.connect = async () => client;
  pool.query = async () => ({ rowCount: 1, rows: [] });
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  try { await updateBorrowRequestStatus({ params: { id: "7" }, body: { status: "Approved" }, user: { id: "staff", role: "staff", department_id: 4 } }, response, (error) => { throw error; }); }
  finally { pool.connect = originalConnect; pool.query = originalQuery; }
  assert.equal(response.statusCode, 404);
  assert.equal(response.body.error, "REQUEST_NOT_FOUND");
});

test("student withdrawal atomically releases reservations, invalidates review, and records audit", async () => {
  const calls = [];
  const client = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes("SELECT * FROM public.borrow_requests")) return { rowCount: 1, rows: [{ id: 21, status: "Pending", user_id: "student", assigned_professor_user_id: "professor", department_id: 2 }] };
    if (sql.includes("SELECT inventory_id,quantity")) return { rowCount: 1, rows: [{ inventory_id: 7, quantity: 2 }] };
    if (sql.includes("UPDATE public.borrow_requests SET status")) return { rowCount: 1, rows: [{ id: 21, status: "Withdrawn" }] };
    return { rowCount: 1, rows: [] };
  }, release() {} };
  const original = pool.connect; pool.connect = async () => client;
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  try { await cancelBorrowRequest({ params: { id: "21" }, body: {}, user: { id: "student", role: "student" } }, res, (error) => { throw error; }); }
  finally { pool.connect = original; }
  assert.equal(res.body.request.status, "Withdrawn");
  assert.deepEqual(calls.find(({ sql }) => sql.includes("reserved_quantity=reserved_quantity-$1")).params, [2, 7]);
  assert.ok(calls.some(({ sql }) => sql.includes("borrow_request_authorizations SET status='rejected'")));
  assert.ok(calls.some(({ sql, params }) => sql.includes("INSERT INTO public.audit_logs") && params.includes("borrowing_withdrawn")));
  assert.equal(calls.at(-1).sql, "COMMIT");
});

test("withdrawal refuses another student's request and terminal requests without changing inventory", async () => {
  for (const row of [{ status: "Pending", user_id: "other" }, { status: "Approved", user_id: "student" }]) {
    const calls = [];
    const client = { async query(sql) { calls.push(sql); if (sql.includes("SELECT * FROM public.borrow_requests")) return { rowCount: 1, rows: [row] }; return { rowCount: 1, rows: [] }; }, release() {} };
    const original = pool.connect; pool.connect = async () => client;
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    try { await cancelBorrowRequest({ params: { id: "21" }, body: {}, user: { id: "student", role: "student" } }, res, (error) => { throw error; }); }
    finally { pool.connect = original; }
    assert.equal(res.statusCode, row.user_id === "other" ? 404 : 409);
    assert.equal(calls.at(-1), "ROLLBACK");
    assert.equal(calls.some((sql) => sql.includes("UPDATE public.inventory")), false);
  }
});

test("staff cancellation requires a reason and is limited to their department", async () => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await cancelBorrowRequest({ params: { id: "21" }, body: { reason: "bad" }, user: { role: "staff" } }, res);
  assert.equal(res.statusCode, 422);
  const client = { async query(sql) { if (sql.includes("SELECT * FROM public.borrow_requests")) return { rowCount: 1, rows: [{ status: "Validated", department_id: 3 }] }; return { rowCount: 1, rows: [] }; }, release() {} };
  const original = pool.connect; pool.connect = async () => client;
  try { await cancelBorrowRequest({ params: { id: "21" }, body: { reason: "Wrong request" }, user: { id: "staff", role: "staff", department_id: 2 } }, res, (error) => { throw error; }); }
  finally { pool.connect = original; }
  assert.equal(res.statusCode, 404);
});

test("processes a complete return and updates inventory condition counters atomically", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes("SELECT * FROM borrow_requests")) return { rowCount: 1, rows: [{ id: 10, status: "Borrowed", user_id: "student-user", department_id: 4 }] };
      if (sql.includes("FROM public.profiles profile") && sql.includes("custodian_signatures")) return { rowCount: 1, rows: [{ full_name:"Receiving Staff",image_data:Buffer.from("signature"),mime_type:"image/png",image_hash:"a".repeat(64) }] };
      if (sql.includes("SELECT inventory_id, quantity FROM borrow_request_items")) return { rows: [{ inventory_id: 7, quantity: 2 }] };
      if (sql.includes("SUM(good_quantity")) return { rows: [] };
      if (sql.includes("INSERT INTO borrowing_returns")) return { rows: [{ id: 20, request_id: 10 }] };
      if (sql.includes("INSERT INTO public.accountability_cases")) return { rowCount: 1, rows: [{ id: 25, case_number: "AC-2030-00000001" }] };
      if (sql.includes("INSERT INTO public.transaction_receipts")) return { rowCount: 1, rows: [{ id: 30, receipt_number: "RCT-2030-00000001", receipt_type: "return" }] };
      if (sql.includes("UPDATE inventory")) return { rowCount: 1, rows: [{ id: 7 }] };
      if (sql.includes("UPDATE borrow_requests SET status")) return { rows: [{ id: 10, status: "Returned" }] };
      if (sql.includes("SELECT request.*,department.name")) return { rowCount:1,rows:[{ id:10,status:"Returned",student_name:"Student",student_id:"S-1",items:[{description:"Pan",quantity:2,released:"2",returned:"2",unreturned:"0",remarks:""}] }] };
      if (sql.includes("coalesce(max(version)")) return { rows:[{version:1}] };
      if (sql.includes("INSERT INTO public.borrowing_document_archives")) return { rowCount:1,rows:[{id:40,version:1,document_state:"finalized"}] };
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const originalConnect = pool.connect;
  pool.connect = async () => client;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  try {
    await processBorrowingReturn({ params: { id: "10" }, body: { items: [{ inventoryId: 7, goodQuantity: 1, damagedQuantity: 1, conditionNote: "Handle damage" }] }, user: { id: "staff-user", role: "staff", department_id:4 } }, response, (error) => { throw error; });
  } finally {
    pool.connect = originalConnect;
  }
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.complete, true);
  const inventoryUpdate = calls.find((call) => call.sql.includes("UPDATE inventory"));
  assert.deepEqual(inventoryUpdate.params, [2, 1, 0, 7]);
  const completionEvent = calls.find((call) => call.sql.includes("borrowing_return_id"));
  assert.equal(completionEvent.params[1], "return_completed");
  assert.equal(completionEvent.params[4], 20);
  assert.ok(calls.some((call) => call.sql.includes("DELETE FROM calendar_events") && call.sql.includes("event_type = 'return_due'")));
  assert.equal(calls.at(-1).sql, "COMMIT");
});

test("returns the original result when an idempotent return submission is retried", async () => {
  const calls = [];
  const key = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes("SELECT * FROM borrow_requests")) return { rowCount: 1, rows: [{ id: 10, status: "Returned" }] };
      if (sql.includes("WHERE returned.idempotency_key")) return { rowCount: 1, rows: [{ id: 20, request_id: 10, request_status: "Returned" }] };
      return { rowCount: 1, rows: [] };
    }, release() {},
  };
  const originalConnect = pool.connect; pool.connect = async () => client;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  try {
    await processBorrowingReturn({ params: { id: "10" }, body: { idempotencyKey: key, items: [{ inventoryId: 7, goodQuantity: 1 }] }, user: { id: "admin-user", role: "admin" } }, response, (error) => { throw error; });
  } finally { pool.connect = originalConnect; }
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.duplicate, true);
  assert.equal(response.body.complete, true);
  assert.equal(calls.some((sql) => sql.includes("INSERT INTO borrowing_returns")), false);
  assert.ok(calls.includes("ROLLBACK"));
});

test("uses the authenticated profile instead of client-supplied student identity", () => {
  const request = authenticatedStudentRequest(
    { studentName: "Impostor", studentId: "FAKE-ID", purpose: "Lab" },
    { full_name: "Actual Student", student_id: "2026-001" }
  );

  assert.equal(request.studentName, "Actual Student");
  assert.equal(request.studentId, "2026-001");
  assert.equal(request.purpose, "Lab");
});

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
    departmentId: 2,
    sectionId: 3,
    assignedProfessorId: "00000000-0000-4000-8000-000000000004",
    items: [{ inventoryId: 7, quantity: "2" }],
  }), {
    studentName: "Juan Dela Cruz",
    studentId: "2026-0001",
    borrowDate: "2026-08-10",
    returnDate: "2026-08-11",
    purpose: "Lab",
    departmentId: 2,
    sectionId: 3,
    assignedProfessorId: "00000000-0000-4000-8000-000000000004",
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
    department_id: 2,
    section_id: 3,
    assigned_professor_user_id: "00000000-0000-4000-8000-000000000004",
    items: [{ inventory_id: 7, quantity: 2 }],
  }), {
    studentName: "Juan Dela Cruz",
    studentId: "2026-0001",
    borrowDate: "2026-08-10",
    returnDate: "2026-08-11",
    purpose: "Lab",
    departmentId: 2,
    sectionId: 3,
    assignedProfessorId: "00000000-0000-4000-8000-000000000004",
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
    department_id: 2,
    department_name: "Hospitality Management",
    department_code: "BSHM",
    section_id: 3,
    section_name: "HM-4A",
    assigned_professor_user_id: "00000000-0000-4000-8000-000000000004",
    assigned_professor_name: "Prof. Santos",
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
    departmentId: 2,
    departmentName: "Hospitality Management",
    departmentCode: "BSHM",
    sectionId: 3,
    sectionName: "HM-4A",
    assignedProfessorId: "00000000-0000-4000-8000-000000000004",
    assignedProfessorName: "Prof. Santos",
    status: "borrowed",
    requestedAt: "2026-08-19T00:00:00Z",
    actualReturnedAt: null,
    overdue: false,
    calendarDisruption: null,
    replacesRequestId: null,
    authorizationStatus: null,
    authorizationToken: null,
    authorizedBy: null,
    authorizedAt: null,
    custodianVerifiedBy: null,
    custodianVerifiedAt: null,
    custodianApprovedBy: null,
    custodianApprovedAt: null,
    releasedBy: null,
    releasedAt: null,
    returnedBy: null,
    returnedAt: null,
    documentState: "released",
    cancellationType: null,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    items: [{ name: "Pan", quantity: 2 }],
  });
});

test("derives partially returned and finalized document states from request data", () => {
  const partiallyReturned = serializeBorrowRequest({
    status: "Borrowed",
    items: [{ quantity: 2, accountedQuantity: 1 }],
  });
  const finalized = serializeBorrowRequest({
    status: "Returned",
    items: [{ quantity: 2, accountedQuantity: 2 }],
  });

  assert.equal(partiallyReturned.documentState, "partially_returned");
  assert.equal(finalized.documentState, "finalized");
});

test("loads conflict context under an immutable authenticated-user advisory lock", async () => {
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
      if (sql.includes("FROM public.inventory_unavailability")) return {
        rows: [{ inventory_id: 7, start_date: "2026-08-11", end_date: "2026-08-13", reason: "Maintenance" }],
      };
      return { rows: [] };
    },
  };

  const context = await loadValidationContext(client, {
    studentId: " STUDENT-1 ",
    borrowDate: "2026-08-10",
    returnDate: "2026-08-12",
    items: [{ inventoryId: 7, quantity: 1 }],
  }, "00000000-0000-4000-8000-000000000001");

  assert.match(calls[0].sql, /pg_advisory_xact_lock/);
  assert.equal(calls[0].params[0], "user:00000000-0000-4000-8000-000000000001");
  assert.match(calls.find((call) => call.sql.includes("COALESCE(SUM")).sql, /::bigint/);
  assert.match(calls.find((call) => call.sql.includes("COALESCE(SUM")).sql, /has_invalid_quantity/);
  const inventorySql = calls.find((call) => call.sql.includes("FROM inventory"));
  assert.match(inventorySql.sql, /next_inspection_date <= \$2::date/);
  assert.equal(inventorySql.params[1], "2026-08-12");
  assert.deepEqual(context.existingBorrowings, [{ inventoryId: 7, quantity: 2 }]);
  assert.deepEqual(context.existingRequests[0].items, [
    { inventoryId: 7, quantity: 1 },
    { inventoryId: 8, quantity: 2 },
  ]);
  assert.deepEqual(context.inventoryAvailability, {
    7: [{ startDate: "2026-08-11", endDate: "2026-08-13", reason: "Maintenance" }],
  });
  const reservationSql = calls.find((call) => call.sql.includes("WITH returned AS"));
  assert.match(reservationSql.sql, /br\.status = 'Borrowed'/);
  assert.match(reservationSql.sql, /GREATEST\(bri\.quantity - COALESCE\(returned\.accounted, 0\), 0\)/);
  const identitySql = calls.find((call) => call.sql.includes("public.borrow_requests request"));
  assert.match(identitySql.sql, /request\.user_id = \$1::uuid/);
});

test("falls back to normalized student identity only for legacy requests", async () => {
  const calls = [];
  const client = { async query(sql, params) { calls.push({ sql, params }); return { rows: [] }; } };
  await loadValidationContext(client, {
    studentId: " LEGACY-1 ", borrowDate: "2026-09-10", returnDate: "2026-09-11",
    items: [{ inventoryId: 7, quantity: 1 }],
  });
  assert.equal(calls[0].params[0], "student:legacy-1");
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

test("requires explicit borrower consent before persisting a request", async () => {
  const statements = [];
  const client = { async query(sql) { statements.push(sql); return { rows: [] }; }, release() {} };
  const result = await withValidation(policyFixture().request,true,{ async connect() { return client; } },{
    userId:"00000000-0000-4000-8000-000000000001",requireStudentSignature:true,studentConsent:false,
  });
  assert.equal(result.validation.valid,false);
  assert.equal(result.validation.reasons[0].code,"BORROWER_CONSENT_REQUIRED");
  assert.equal(statements.at(-1),"ROLLBACK");
});

test("requires a saved student signature before persisting a request", async () => {
  const statements = [];
  const client = { async query(sql) { statements.push(sql); return { rows: [] }; }, release() {} };
  const result = await withValidation(policyFixture().request,true,{ async connect() { return client; } },{
    userId:"00000000-0000-4000-8000-000000000001",requireStudentSignature:true,studentConsent:true,
  });
  assert.equal(result.validation.valid,false);
  assert.equal(result.validation.reasons[0].code,"BORROWER_SIGNATURE_REQUIRED");
  assert.equal(statements.at(-1),"ROLLBACK");
});

test("runs all eight borrowing-policy constraints for a valid request", () => {
  const validation = validatePolicyConstraints(policyFixture());

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.checkedConstraints, ALL_POLICY_CONSTRAINTS);
  assert.deepEqual(validation.reasons, []);
});

test("blocks a policy-valid request while an accountability case is unresolved", () => {
  const validation = validatePolicyConstraints({ ...policyFixture(), accountabilityCaseNumber: "AC-2030-00000001" });
  assert.equal(validation.valid, false);
  assert.equal(validation.reasons.at(-1).code, "UNRESOLVED_ACCOUNTABILITY");
  assert.match(validation.reasons.at(-1).message, /AC-2030-00000001/);
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
          items: [{ inventoryId: 99, quantity: 1 }],
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

test("blocks a policy-valid item when the student has a different outstanding item", () => {
  const validation = validatePolicyConstraints(policyFixture({
    existingRequests: [{
      id: 14,
      studentId: " STUDENT-1 ",
      borrowDate: "2026-08-01",
      returnDate: "2026-08-02",
      purpose: "Earlier class",
      status: "Borrowed",
      items: [{ inventoryId: 99, quantity: 1 }],
    }],
  }));

  assert.equal(validation.valid, false);
  assert.equal(
    validation.reasons.some((reason) => reason.code === "OUTSTANDING_BORROWING"),
    true
  );
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
      if (sql.includes("INSERT INTO public.borrow_request_authorizations")) return { rows: [{ review_token: "00000000-0000-4000-8000-000000000101" }] };
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

test("rolls back when a database unavailability period intersects the request", async () => {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes("FROM public.inventory_unavailability")) return {
        rows: [{
          inventory_id: 7,
          start_date: "2026-09-11",
          end_date: "2026-09-12",
          reason: "Annual inspection",
        }],
      };
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
    { now: policyFixture().now }
  );

  assert.equal(result.validation.valid, false);
  assert.equal(
    result.validation.reasons.some((reason) =>
      reason.code === "INVENTORY_DATE_UNAVAILABLE" && reason.message.includes("Annual inspection")),
    true
  );
  assert.equal(statements.at(-1), "ROLLBACK");
  assert.equal(statements.some((sql) => /^\s*(INSERT|UPDATE)/.test(sql)), false);
});
