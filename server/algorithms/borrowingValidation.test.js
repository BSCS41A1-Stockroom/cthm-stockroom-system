"use strict";

const {
  validateBorrowingRequest,
  validateBorrowingRequestShape,
} = require("./borrowingValidation");

const {
  detectBorrowingConflicts,
} = require("./conflictDetection");


console.log("========================================");
console.log("CTHM STOCKROOM - BORROWING VALIDATION TEST");
console.log("========================================");


function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`✅ ${message}`);
}


/* ============================================================
   TEST DATA
============================================================ */

const inventory = [
  {
    id: 1,
    item_name: "Projector",
    quantity: 5,
    additional_qty: 0,
    replaces: 0,
    missing: 0,
    breakage: 0,
    defective: 0,
    total_loss: 0,
  },

  {
    id: 2,
    item_name: "Laptop",
    quantity: 10,
    additional_qty: 0,
    replaces: 0,
    missing: 0,
    breakage: 0,
    defective: 0,
    total_loss: 0,
  },

  {
    id: 3,
    item_name: "HDMI Cable",
    quantity: 20,
    additional_qty: 0,
    replaces: 0,
    missing: 0,
    breakage: 0,
    defective: 0,
    total_loss: 0,
  },
];


/* ============================================================
   TEST 1
   REQUEST SHAPE
============================================================ */

console.log("\nTEST 1: Request shape validation");

const validRequest = {
  studentName: "Juan Dela Cruz",
  studentId: "2026-00123",
  borrowDate: "2026-08-20",
  returnDate: "2026-08-22",
  purpose: "CTHM laboratory activity",

  items: [
    {
      inventoryId: 1,
      quantity: 1,
    },
  ],
};

const shapeErrors =
  validateBorrowingRequestShape(
    validRequest
  );

assert(
  shapeErrors.length === 0,
  "Valid borrowing request passes shape validation"
);


/* ============================================================
   TEST 2
   INVALID DATE
============================================================ */

console.log("\nTEST 2: Invalid date");

const invalidDateRequest = {
  ...validRequest,
  borrowDate: "2026-99-99",
};

const invalidDateErrors =
  validateBorrowingRequestShape(
    invalidDateRequest
  );

assert(
  invalidDateErrors.some(
    (error) =>
      error.code === "INVALID_BORROW_DATE"
  ),
  "Invalid borrow date is detected"
);


/* ============================================================
   TEST 3
   RETURN DATE BEFORE BORROW DATE
============================================================ */

console.log("\nTEST 3: Invalid date range");

const invalidRangeRequest = {
  ...validRequest,

  borrowDate: "2026-08-25",
  returnDate: "2026-08-20",
};

const invalidRangeErrors =
  validateBorrowingRequestShape(
    invalidRangeRequest
  );

assert(
  invalidRangeErrors.some(
    (error) =>
      error.code === "INVALID_DATE_RANGE"
  ),
  "Return date before borrow date is rejected"
);


/* ============================================================
   TEST 4
   VALID CSP REQUEST
============================================================ */

console.log("\nTEST 4: CSP valid request");

const cspValid =
  validateBorrowingRequest({
    request: validRequest,

    inventory,

    existingBorrowings: [],
  });

assert(
  cspValid.valid === true,
  "Valid inventory request passes CSP"
);

assert(
  cspValid.assignment !== null,
  "CSP produces an assignment"
);


/* ============================================================
   TEST 5
   INSUFFICIENT INVENTORY
============================================================ */

console.log("\nTEST 5: Insufficient inventory");

const tooManyProjectors = {
  ...validRequest,

  items: [
    {
      inventoryId: 1,

      /*
       * Only 5 projectors exist.
       */
      quantity: 6,
    },
  ],
};

const insufficient =
  validateBorrowingRequest({
    request: tooManyProjectors,

    inventory,

    existingBorrowings: [],
  });

assert(
  insufficient.valid === false,
  "Request exceeding inventory is rejected"
);

assert(
  insufficient.reasons.some(
    (reason) =>
      reason.code ===
      "INSUFFICIENT_INVENTORY"
  ),
  "INSUFFICIENT_INVENTORY conflict is generated"
);


/* ============================================================
   TEST 6
   RESERVED INVENTORY
============================================================ */

console.log("\nTEST 6: Existing reservation");

const reservationConflict =
  validateBorrowingRequest({
    request: {
      ...validRequest,

      items: [
        {
          inventoryId: 1,
          quantity: 2,
        },
      ],
    },

    inventory,

    existingBorrowings: [
      {
        inventoryId: 1,
        quantity: 4,
      },
    ],
  });

assert(
  reservationConflict.valid === false,
  "Request exceeding remaining inventory is rejected"
);

assert(
  reservationConflict.reasons.some(
    (reason) =>
      reason.code ===
      "INSUFFICIENT_INVENTORY"
  ),
  "Reserved quantity is included in capacity checking"
);


/* ============================================================
   TEST 7
   DUPLICATE REQUEST
============================================================ */

console.log("\nTEST 7: Duplicate borrowing request");

const existingDuplicate = [
  {
    id: 100,

    studentId:
      "2026-00123",

    borrowDate:
      "2026-08-20",

    returnDate:
      "2026-08-22",

    status:
      "Pending",

    items: [
      {
        inventoryId: 1,
        quantity: 1,
      },
    ],
  },
];

const duplicateResult =
  detectBorrowingConflicts({
    request: validRequest,

    existingRequests:
      existingDuplicate,

    validation: {
      reasons: [],
    },
  });

assert(
  duplicateResult.some(
    (conflict) =>
      conflict.code ===
      "DUPLICATE_BORROWING_REQUEST"
  ),
  "Duplicate borrowing request is detected"
);


/* ============================================================
   TEST 8
   SCHEDULE OVERLAP
============================================================ */

console.log("\nTEST 8: Schedule overlap");

const overlappingRequest = [
  {
    id: 101,

    studentId:
      "2026-00123",

    borrowDate:
      "2026-08-21",

    returnDate:
      "2026-08-25",

    status:
      "Approved",

    items: [
      {
        inventoryId: 2,
        quantity: 1,
      },
    ],
  },
];

const overlapResult =
  detectBorrowingConflicts({
    request: {
      ...validRequest,

      items: [
        {
          inventoryId: 2,
          quantity: 1,
        },
      ],
    },

    existingRequests:
      overlappingRequest,

    validation: {
      reasons: [],
    },
  });

assert(
  overlapResult.some(
    (conflict) =>
      conflict.code ===
      "BORROWING_SCHEDULE_OVERLAP"
  ),
  "Overlapping borrowing schedule is detected"
);


/* ============================================================
   TEST 9
   NON-OVERLAPPING REQUEST
============================================================ */

console.log("\nTEST 9: Non-overlapping schedule");

const nonOverlapRequest = [
  {
    id: 102,

    studentId:
      "2026-00123",

    borrowDate:
      "2026-09-01",

    returnDate:
      "2026-09-03",

    status:
      "Approved",

    items: [
      {
        inventoryId: 2,
        quantity: 1,
      },
    ],
  },
];

const noConflict =
  detectBorrowingConflicts({
    request: validRequest,

    existingRequests:
      nonOverlapRequest,

    validation: {
      reasons: [],
    },
  });

assert(
  noConflict.length === 0,
  "Non-overlapping request has no conflict"
);


/* ============================================================
   TEST 10
   SAME-DAY OVERLAP
============================================================ */

console.log("\nTEST 10: Inclusive date boundary");

const sameDayRequest = [
  {
    id: 103,

    studentId:
      "2026-00123",

    borrowDate:
      "2026-08-22",

    returnDate:
      "2026-08-24",

    status:
      "Approved",

    items: [
      {
        inventoryId: 2,
        quantity: 1,
      },
    ],
  },
];

const sameDayResult =
  detectBorrowingConflicts({
    request: validRequest,

    existingRequests:
      sameDayRequest,

    validation: {
      reasons: [],
    },
  });

assert(
  sameDayResult.some(
    (conflict) =>
      conflict.code ===
      "BORROWING_SCHEDULE_OVERLAP"
  ),
  "Same-day boundary is treated as overlap"
);


/* ============================================================
   TEST 11
   REJECTED REQUEST SHOULD NOT CONFLICT
============================================================ */

console.log("\nTEST 11: Rejected request");

const rejectedRequest = [
  {
    id: 104,

    studentId:
      "2026-00123",

    borrowDate:
      "2026-08-20",

    returnDate:
      "2026-08-22",

    status:
      "Rejected",

    items: [
      {
        inventoryId: 1,
        quantity: 1,
      },
    ],
  },
];

const rejectedResult =
  detectBorrowingConflicts({
    request: validRequest,

    existingRequests:
      rejectedRequest,

    validation: {
      reasons: [],
    },
  });

assert(
  rejectedResult.length === 0,
  "Rejected requests are ignored"
);


/* ============================================================
   TEST 12
   MULTIPLE ITEMS
============================================================ */

console.log("\nTEST 12: Multiple inventory items");

const multipleItemRequest = {
  ...validRequest,

  items: [
    {
      inventoryId: 1,
      quantity: 1,
    },

    {
      inventoryId: 2,
      quantity: 2,
    },

    {
      inventoryId: 3,
      quantity: 5,
    },
  ],
};

const multipleValidation =
  validateBorrowingRequest({
    request:
      multipleItemRequest,

    inventory,

    existingBorrowings: [],
  });

assert(
  multipleValidation.valid === true,
  "Multiple inventory items pass CSP"
);


/* ============================================================
   FINAL RESULT
============================================================ */

console.log("\n========================================");

if (
  process.exitCode === 1
) {
  console.log(
    "❌ SOME TESTS FAILED"
  );
} else {
  console.log(
    "✅ ALL BORROWING VALIDATION TESTS PASSED"
  );
}

console.log(
  "========================================"
);