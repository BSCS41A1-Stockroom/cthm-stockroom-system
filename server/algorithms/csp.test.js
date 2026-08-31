"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  checkInventoryCapacity,
  checkTimeOverlap,
  checkDuplicateRequest,
  checkBorrowingLimit,
  checkLeadTime,
  checkOutstandingBorrowing,
  checkStatus,
  checkAvailabilityDate,
  intervalsOverlap,
  validateBorrowingRequest,
} = require("./csp");


/* =========================================================
   HELPERS
========================================================= */

function baseRequest(overrides = {}) {
  return {
    id: "REQ-001",
    studentId: "STU-001",

    borrowDate: "2026-08-20",
    returnDate: "2026-08-20",

    startTime: "08:00",
    endTime: "10:00",

    submittedAt: "2026-08-17",

    purpose: "Cooking Laboratory",

    status: "pending",

    items: [
      {
        itemId: "knife",
        quantity: 2,
      },
    ],

    ...overrides,
  };
}


function existingRequest(overrides = {}) {
  return {
    id: "REQ-OLD",
    studentId: "STU-002",

    borrowDate: "2026-08-20",
    returnDate: "2026-08-20",

    startTime: "08:00",
    endTime: "10:00",

    purpose: "Cooking Laboratory",

    status: "approved",

    items: [
      {
        itemId: "knife",
        quantity: 2,
      },
    ],

    ...overrides,
  };
}


/* =========================================================
   INTERVAL
========================================================= */

test("detects overlapping time intervals", () => {
  assert.equal(
    intervalsOverlap(
      8 * 60,
      10 * 60,
      9 * 60,
      11 * 60
    ),
    true
  );
});


test("allows back-to-back intervals", () => {
  assert.equal(
    intervalsOverlap(
      8 * 60,
      10 * 60,
      10 * 60,
      12 * 60
    ),
    false
  );
});


test("detects when one interval is completely inside another", () => {
  assert.equal(
    intervalsOverlap(
      8 * 60,
      12 * 60,
      9 * 60,
      10 * 60
    ),
    true
  );
});


/* =========================================================
   1. INVENTORY CAPACITY
========================================================= */

test("rejects request when inventory quantity is insufficient", () => {
  const request = baseRequest({
    items: [
      {
        itemId: "knife",
        quantity: 5,
      },
    ],
  });

  const result = checkInventoryCapacity(
    request,
    {
      knife: 3,
    }
  );

  assert.equal(result.satisfied, false);
  assert.equal(
    result.constraint,
    "inventory_capacity"
  );
});


test("allows request when inventory quantity is sufficient", () => {
  const request = baseRequest({
    items: [
      {
        itemId: "knife",
        quantity: 3,
      },
    ],
  });

  const result = checkInventoryCapacity(
    request,
    {
      knife: 5,
    }
  );

  assert.equal(result.satisfied, true);
});


/* =========================================================
   2. TIME OVERLAP
========================================================= */

test("rejects overlapping borrowing of the same item", () => {
  const request = baseRequest({
    startTime: "09:00",
    endTime: "11:00",
  });

  const existing = existingRequest({
    startTime: "08:00",
    endTime: "10:00",
  });

  const result = checkTimeOverlap(
    request,
    [existing]
  );

  assert.equal(result.satisfied, false);
  assert.equal(
    result.constraint,
    "time_overlap"
  );
});


test("allows borrowing when times do not overlap", () => {
  const request = baseRequest({
    startTime: "10:00",
    endTime: "12:00",
  });

  const existing = existingRequest({
    startTime: "08:00",
    endTime: "10:00",
  });

  const result = checkTimeOverlap(
    request,
    [existing]
  );

  assert.equal(result.satisfied, true);
});


test("allows overlapping times when different items are borrowed", () => {
  const request = baseRequest({
    startTime: "09:00",
    endTime: "11:00",
    items: [
      {
        itemId: "mixing-bowl",
        quantity: 1,
      },
    ],
  });

  const existing = existingRequest({
    startTime: "08:00",
    endTime: "10:00",
    items: [
      {
        itemId: "knife",
        quantity: 2,
      },
    ],
  });

  const result = checkTimeOverlap(
    request,
    [existing]
  );

  assert.equal(result.satisfied, true);
});


/* =========================================================
   3. DUPLICATE REQUEST
========================================================= */

test("rejects duplicate borrowing request", () => {
  const request = baseRequest();

  const existing = existingRequest({
    studentId: "STU-001",
    borrowDate: "2026-08-20",
    purpose: "Cooking Laboratory",

    items: [
      {
        itemId: "knife",
        quantity: 2,
      },
    ],
  });

  const result = checkDuplicateRequest(
    request,
    [existing]
  );

  assert.equal(result.satisfied, false);
  assert.equal(
    result.constraint,
    "duplicate_request"
  );
});


test("allows request when items differ", () => {
  const request = baseRequest();

  const existing = existingRequest({
    studentId: "STU-001",

    items: [
      {
        itemId: "mixing-bowl",
        quantity: 2,
      },
    ],
  });

  const result = checkDuplicateRequest(
    request,
    [existing]
  );

  assert.equal(result.satisfied, true);
});


/* =========================================================
   4. BORROWING LIMIT
========================================================= */

test("rejects request exceeding quantity limit", () => {
  const request = baseRequest({
    items: [
      {
        itemId: "knife",
        quantity: 11,
      },
    ],
  });

  const result = checkBorrowingLimit(
    request,
    {
      maxQuantityPerStudent: 10,
      maxItemsPerRequest: 10,
    }
  );

  assert.equal(result.satisfied, false);
  assert.equal(
    result.constraint,
    "borrowing_limit"
  );
});


test("rejects request exceeding different-item limit", () => {
  const request = baseRequest({
    items: Array.from(
      { length: 11 },
      (_, index) => ({
        itemId: `item-${index}`,
        quantity: 1,
      })
    ),
  });

  const result = checkBorrowingLimit(
    request,
    {
      maxQuantityPerStudent: 20,
      maxItemsPerRequest: 10,
    }
  );

  assert.equal(result.satisfied, false);
});


test("allows request within borrowing limit", () => {
  const request = baseRequest({
    items: [
      {
        itemId: "knife",
        quantity: 5,
      },
    ],
  });

  const result = checkBorrowingLimit(
    request,
    {
      maxQuantityPerStudent: 10,
      maxItemsPerRequest: 10,
    }
  );

  assert.equal(result.satisfied, true);
});


/* =========================================================
   5. LEAD TIME
========================================================= */

test("rejects request submitted too close to borrowing date", () => {
  const request = baseRequest({
    borrowDate: "2026-08-18",
  });

  const result = checkLeadTime(
    request,
    new Date("2026-08-17T10:00:00"),
    {
      leadTimeDays: 2,
    }
  );

  assert.equal(result.satisfied, false);
  assert.equal(
    result.constraint,
    "lead_time"
  );
});


test("allows request submitted at least two days before borrowing", () => {
  const request = baseRequest({
    borrowDate: "2026-08-20",
  });

  const result = checkLeadTime(
    request,
    new Date("2026-08-17T10:00:00"),
    {
      leadTimeDays: 2,
    }
  );

  assert.equal(result.satisfied, true);
});


/* =========================================================
   6. RETURN / OUTSTANDING
========================================================= */

test("rejects borrowing when student has outstanding item", () => {
  const request = baseRequest({
    studentId: "STU-001",
  });

  const existing = existingRequest({
    studentId: "STU-001",
    status: "approved",

    items: [
      {
        itemId: "knife",
        quantity: 1,
      },
    ],
  });

  const result = checkOutstandingBorrowing(
    request,
    [existing],
    {
      preventOutstandingBorrowing: true,
    }
  );

  assert.equal(result.satisfied, false);
  assert.equal(
    result.constraint,
    "return_outstanding"
  );
});


test("allows borrowing after previous item was returned", () => {
  const request = baseRequest({
    studentId: "STU-001",
  });

  const existing = existingRequest({
    studentId: "STU-001",
    status: "returned",

    items: [
      {
        itemId: "knife",
        quantity: 1,
      },
    ],
  });

  const result = checkOutstandingBorrowing(
    request,
    [existing],
    {
      preventOutstandingBorrowing: true,
    }
  );

  assert.equal(result.satisfied, true);
});


/* =========================================================
   7. STATUS
========================================================= */

test("rejects request when student already has active request for same item and date", () => {
  const request = baseRequest({
    studentId: "STU-001",
    borrowDate: "2026-08-20",
  });

  const existing = existingRequest({
    studentId: "STU-001",
    borrowDate: "2026-08-20",
    status: "pending",

    items: [
      {
        itemId: "knife",
        quantity: 1,
      },
    ],
  });

  const result = checkStatus(
    request,
    [existing]
  );

  assert.equal(result.satisfied, false);
  assert.equal(
    result.constraint,
    "status"
  );
});


test("allows request when previous request is rejected", () => {
  const request = baseRequest({
    studentId: "STU-001",
    borrowDate: "2026-08-20",
  });

  const existing = existingRequest({
    studentId: "STU-001",
    borrowDate: "2026-08-20",
    status: "rejected",

    items: [
      {
        itemId: "knife",
        quantity: 1,
      },
    ],
  });

  const result = checkStatus(
    request,
    [existing]
  );

  assert.equal(result.satisfied, true);
});


/* =========================================================
   8. AVAILABILITY DATE
========================================================= */

test("rejects borrowing on unavailable date", () => {
  const request = baseRequest({
    borrowDate: "2026-08-20",
  });

  const result = checkAvailabilityDate(
    request,
    {
      knife: [
        "2026-08-21",
        "2026-08-22",
      ],
    }
  );

  assert.equal(result.satisfied, false);
  assert.equal(
    result.constraint,
    "availability_date"
  );
});


test("allows borrowing on available date", () => {
  const request = baseRequest({
    borrowDate: "2026-08-20",
  });

  const result = checkAvailabilityDate(
    request,
    {
      knife: [
        "2026-08-20",
        "2026-08-21",
      ],
    }
  );

  assert.equal(result.satisfied, true);
});


/* =========================================================
   COMPLETE CSP VALIDATION
========================================================= */

test("accepts valid borrowing request", () => {
  const request = baseRequest();

  const result = validateBorrowingRequest({
    request,

    existingRequests: [],

    inventory: {
      knife: 10,
    },

    inventoryAvailability: {
      knife: [
        "2026-08-20",
      ],
    },

    policy: {
      maxItemsPerRequest: 10,
      maxQuantityPerStudent: 10,
      leadTimeDays: 2,
      preventOutstandingBorrowing: true,
    },

    now: new Date(
      "2026-08-17T10:00:00"
    ),
  });

  assert.equal(result.valid, true);
  assert.equal(
    result.violations.length,
    0
  );
});


test("rejects request with multiple CSP violations", () => {
  const request = baseRequest({
    borrowDate: "2026-08-18",

    items: [
      {
        itemId: "knife",
        quantity: 15,
      },
    ],
  });

  const existing = existingRequest({
    id: "REQ-OLD",
    studentId: "STU-001",

    borrowDate: "2026-08-18",

    startTime: "09:00",
    endTime: "11:00",

    purpose: "Cooking Laboratory",

    status: "approved",

    items: [
      {
        itemId: "knife",
        quantity: 2,
      },
    ],
  });

  const result = validateBorrowingRequest({
    request,

    existingRequests: [
      existing,
    ],

    inventory: {
      knife: 5,
    },

    inventoryAvailability: {
      knife: [
        "2026-08-20",
      ],
    },

    policy: {
      maxItemsPerRequest: 10,
      maxQuantityPerStudent: 10,
      leadTimeDays: 2,
      preventOutstandingBorrowing: true,
    },

    now: new Date(
      "2026-08-17T10:00:00"
    ),
  });

  assert.equal(result.valid, false);

  assert.ok(
    result.violations.length >= 3
  );

  const constraintNames =
    result.violations.map(
      (violation) =>
        violation.constraint
    );

  assert.ok(
    constraintNames.includes(
      "inventory_capacity"
    )
  );

  assert.ok(
    constraintNames.includes(
      "lead_time"
    )
  );

  assert.ok(
    constraintNames.includes(
      "availability_date"
    )
  );
});

test("rejects a different item while the student has an outstanding borrowing", () => {
  const request = baseRequest({
    studentId: "STU-001",
    items: [{ itemId: "plate", quantity: 1 }],
  });
  const existing = existingRequest({
    studentId: " stu-001 ",
    status: "borrowed",
    items: [{ itemId: "knife", quantity: 1 }],
  });

  const result = checkOutstandingBorrowing(request, [existing], {
    preventOutstandingBorrowing: true,
  });

  assert.equal(result.satisfied, false);
  assert.equal(result.constraint, "return_outstanding");
  assert.match(result.message, /all borrowed items must be returned/i);
});

test("rejects a multi-day request that intersects an unavailable period", () => {
  const request = baseRequest({
    borrowDate: "2026-08-20",
    returnDate: "2026-08-23",
  });

  const result = checkAvailabilityDate(request, {
    knife: [{ startDate: "2026-08-22", endDate: "2026-08-25", reason: "Maintenance" }],
  });

  assert.equal(result.satisfied, false);
  assert.match(result.message, /Maintenance/);
});

test("allows a request outside all unavailable periods", () => {
  const request = baseRequest({
    borrowDate: "2026-08-20",
    returnDate: "2026-08-21",
  });

  const result = checkAvailabilityDate(request, {
    knife: [{ startDate: "2026-08-22", endDate: "2026-08-25", reason: "Maintenance" }],
  });

  assert.equal(result.satisfied, true);
});

test("calculates lead time using the configured business timezone", () => {
  const request = baseRequest({ borrowDate: "2026-08-20" });
  const result = checkLeadTime(
    request,
    new Date("2026-08-18T16:30:00Z"),
    { leadTimeDays: 2, timeZone: "Asia/Manila" }
  );

  assert.equal(result.satisfied, false);
});

test("detects overlapping borrowing date ranges when times are not provided", () => {
  const request = baseRequest({ startTime: undefined, endTime: undefined });
  const existing = existingRequest({
    borrowDate: "2026-08-19",
    returnDate: "2026-08-21",
    startTime: undefined,
    endTime: undefined,
  });

  assert.equal(checkTimeOverlap(request, [existing]).satisfied, false);
});
