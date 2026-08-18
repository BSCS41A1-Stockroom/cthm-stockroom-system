"use strict";

/**
 * ============================================================
 * CTHM STOCKROOM
 * CONFLICT DETECTION TEST
 * ============================================================
 *
 * Tests:
 *
 * 1. No conflict
 * 2. Duplicate request
 * 3. Schedule overlap
 * 4. Different student
 * 5. Different dates
 * 6. Same-day boundary
 * 7. Returned request ignored
 * 8. Rejected request ignored
 * 9. Insufficient inventory
 * 10. Multiple conflicts
 * 11. Active statuses
 * 12. Item order does not matter
 * ============================================================
 */

const {
  detectBorrowingConflicts,
  isDuplicate,
  datesOverlap,
  itemSignature,
  normalizeRequest,
  isActiveStatus,
} = require("./conflictDetection");


/* ============================================================
   ASSERT
============================================================ */

function assert(condition, message) {
  if (!condition) {
    throw new Error(`❌ TEST FAILED: ${message}`);
  }

  console.log(`✅ ${message}`);
}


/* ============================================================
   REQUEST FACTORY
============================================================ */

function makeRequest({
  id = null,
  studentId = "2026-001",
  borrowDate = "2026-08-20",
  returnDate = "2026-08-22",
  status = "Pending",
  items = [
    {
      inventoryId: 1,
      quantity: 1,
    },
  ],
} = {}) {
  return {
    id,
    studentId,
    borrowDate,
    returnDate,
    status,
    items,
  };
}


/* ============================================================
   HEADER
============================================================ */

console.log("");
console.log("========================================");
console.log("CTHM STOCKROOM");
console.log("CONFLICT DETECTION TEST");
console.log("========================================");
console.log("");


/* ============================================================
   TEST 1
   REQUEST NORMALIZATION
============================================================ */

console.log("TEST 1: Request normalization");

const normalized =
  normalizeRequest({
    id: 100,

    student_id:
      "2026-001",

    borrow_date:
      "2026-08-20T00:00:00.000Z",

    return_date:
      "2026-08-22T00:00:00.000Z",

    status:
      "Pending",

    items: [
      {
        inventory_id: 1,
        quantity: 2,
      },
    ],
  });


assert(
  normalized.studentId ===
    "2026-001",
  "Snake_case student ID is normalized"
);

assert(
  normalized.borrowDate ===
    "2026-08-20",
  "Borrow date is normalized"
);

assert(
  normalized.returnDate ===
    "2026-08-22",
  "Return date is normalized"
);

assert(
  normalized.items[0].inventoryId === 1,
  "Inventory ID is normalized"
);

assert(
  normalized.items[0].quantity === 2,
  "Quantity is normalized"
);


/* ============================================================
   TEST 2
   DATE OVERLAP
============================================================ */

console.log("");
console.log("TEST 2: Date overlap");

const dateA =
  makeRequest({
    borrowDate:
      "2026-08-20",

    returnDate:
      "2026-08-22",
  });

const dateB =
  makeRequest({
    borrowDate:
      "2026-08-21",

    returnDate:
      "2026-08-25",
  });

assert(
  datesOverlap(
    dateA,
    dateB
  ),
  "Overlapping dates are detected"
);


const dateC =
  makeRequest({
    borrowDate:
      "2026-08-23",

    returnDate:
      "2026-08-25",
  });

assert(
  !datesOverlap(
    dateA,
    dateC
  ),
  "Non-overlapping dates are not detected"
);


/* ============================================================
   TEST 3
   SAME-DAY BOUNDARY
============================================================ */

console.log("");
console.log("TEST 3: Same-day boundary");

const boundaryA =
  makeRequest({
    borrowDate:
      "2026-08-20",

    returnDate:
      "2026-08-22",
  });

const boundaryB =
  makeRequest({
    borrowDate:
      "2026-08-22",

    returnDate:
      "2026-08-25",
  });

assert(
  datesOverlap(
    boundaryA,
    boundaryB
  ),
  "Same-day boundary is treated as overlap"
);


/* ============================================================
   TEST 4
   ITEM SIGNATURE
============================================================ */

console.log("");
console.log("TEST 4: Item signature");

const signatureA =
  itemSignature([
    {
      inventoryId: 1,
      quantity: 2,
    },
    {
      inventoryId: 5,
      quantity: 1,
    },
  ]);

const signatureB =
  itemSignature([
    {
      inventoryId: 5,
      quantity: 1,
    },
    {
      inventoryId: 1,
      quantity: 2,
    },
  ]);

assert(
  signatureA ===
    signatureB,
  "Item order does not affect signature"
);


/* ============================================================
   TEST 5
   DUPLICATE REQUEST
============================================================ */

console.log("");
console.log("TEST 5: Duplicate request");

const requestA =
  makeRequest({
    id: 1,

    studentId:
      "2026-001",

    borrowDate:
      "2026-08-20",

    returnDate:
      "2026-08-22",

    items: [
      {
        inventoryId: 1,
        quantity: 2,
      },

      {
        inventoryId: 2,
        quantity: 1,
      },
    ],
  });


const requestB =
  makeRequest({
    id: 2,

    studentId:
      "2026-001",

    borrowDate:
      "2026-08-20",

    returnDate:
      "2026-08-22",

    items: [
      {
        inventoryId: 2,
        quantity: 1,
      },

      {
        inventoryId: 1,
        quantity: 2,
      },
    ],
  });


assert(
  isDuplicate(
    requestA,
    requestB
  ),
  "Identical requests are detected as duplicates"
);


/* ============================================================
   TEST 6
   DIFFERENT QUANTITY
============================================================ */

console.log("");
console.log("TEST 6: Different quantity");

const differentQuantity =
  makeRequest({
    id: 3,

    studentId:
      "2026-001",

    borrowDate:
      "2026-08-20",

    returnDate:
      "2026-08-22",

    items: [
      {
        inventoryId: 1,
        quantity: 3,
      },

      {
        inventoryId: 2,
        quantity: 1,
      },
    ],
  });

assert(
  !isDuplicate(
    requestA,
    differentQuantity
  ),
  "Different quantity is not a duplicate"
);


/* ============================================================
   TEST 7
   DIFFERENT ITEM
============================================================ */

console.log("");
console.log("TEST 7: Different inventory item");

const differentItem =
  makeRequest({
    id: 4,

    studentId:
      "2026-001",

    borrowDate:
      "2026-08-20",

    returnDate:
      "2026-08-22",

    items: [
      {
        inventoryId: 99,
        quantity: 2,
      },
    ],
  });

assert(
  !isDuplicate(
    requestA,
    differentItem
  ),
  "Different inventory item is not a duplicate"
);


/* ============================================================
   TEST 8
   DIFFERENT STUDENT
============================================================ */

console.log("");
console.log("TEST 8: Different student");

const differentStudent =
  makeRequest({
    id: 5,

    studentId:
      "2026-999",

    borrowDate:
      "2026-08-20",

    returnDate:
      "2026-08-22",

    items: [
      {
        inventoryId: 1,
        quantity: 2,
      },

      {
        inventoryId: 2,
        quantity: 1,
      },
    ],
  });

assert(
  !isDuplicate(
    requestA,
    differentStudent
  ),
  "Different student is not a duplicate"
);


/* ============================================================
   TEST 9
   DUPLICATE CONFLICT
============================================================ */

console.log("");
console.log("TEST 9: Duplicate conflict detection");

const duplicateResult =
  detectBorrowingConflicts({
    request:
      requestB,

    existingRequests: [
      requestA,
    ],

    validation: {
      valid: true,
      reasons: [],
    },
  });

assert(
  duplicateResult.length === 1,
  "Duplicate produces exactly one conflict"
);

assert(
  duplicateResult[0].code ===
    "DUPLICATE_BORROWING_REQUEST",
  "Correct duplicate conflict code"
);


/* ============================================================
   TEST 10
   SCHEDULE OVERLAP
============================================================ */

console.log("");
console.log("TEST 10: Schedule overlap");

const overlappingRequest =
  makeRequest({
    id: 10,

    studentId:
      "2026-001",

    borrowDate:
      "2026-08-21",

    returnDate:
      "2026-08-25",

    items: [
      {
        inventoryId: 99,
        quantity: 1,
      },
    ],
  });


const overlapResult =
  detectBorrowingConflicts({
    request:
      overlappingRequest,

    existingRequests: [
      requestA,
    ],

    validation: {
      valid: true,
      reasons: [],
    },
  });

assert(
  overlapResult.some(
    (conflict) =>
      conflict.code ===
      "BORROWING_SCHEDULE_OVERLAP"
  ),
  "Schedule overlap is detected"
);


/* ============================================================
   TEST 11
   DIFFERENT STUDENT
============================================================ */

console.log("");
console.log("TEST 11: Different student schedule");

const differentStudentOverlap =
  makeRequest({
    id: 11,

    studentId:
      "2026-999",

    borrowDate:
      "2026-08-21",

    returnDate:
      "2026-08-25",

    items: [
      {
        inventoryId: 99,
        quantity: 1,
      },
    ],
  });


const differentStudentResult =
  detectBorrowingConflicts({
    request:
      differentStudentOverlap,

    existingRequests: [
      requestA,
    ],

    validation: {
      valid: true,
      reasons: [],
    },
  });


assert(
  !differentStudentResult.some(
    (conflict) =>
      conflict.code ===
      "BORROWING_SCHEDULE_OVERLAP"
  ),
  "Different student does not trigger student schedule conflict"
);


/* ============================================================
   TEST 12
   NON-OVERLAPPING REQUEST
============================================================ */

console.log("");
console.log("TEST 12: Non-overlapping request");

const cleanRequest =
  makeRequest({
    id: 12,

    studentId:
      "2026-001",

    borrowDate:
      "2026-09-01",

    returnDate:
      "2026-09-03",

    items: [
      {
        inventoryId: 99,
        quantity: 1,
      },
    ],
  });


const cleanResult =
  detectBorrowingConflicts({
    request:
      cleanRequest,

    existingRequests: [
      requestA,
    ],

    validation: {
      valid: true,
      reasons: [],
    },
  });


assert(
  cleanResult.length === 0,
  "Non-overlapping request has no conflict"
);


/* ============================================================
   TEST 13
   RETURNED REQUEST
============================================================ */

console.log("");
console.log("TEST 13: Returned request");

const returnedRequest =
  makeRequest({
    id: 13,

    studentId:
      "2026-001",

    borrowDate:
      "2026-08-20",

    returnDate:
      "2026-08-25",

    status:
      "Returned",

    items: [
      {
        inventoryId: 1,
        quantity: 1,
      },
    ],
  });


const returnedResult =
  detectBorrowingConflicts({
    request:
      overlappingRequest,

    existingRequests: [
      returnedRequest,
    ],

    validation: {
      valid: true,
      reasons: [],
    },
  });


assert(
  returnedResult.length === 0,
  "Returned request is ignored"
);


/* ============================================================
   TEST 14
   REJECTED REQUEST
============================================================ */

console.log("");
console.log("TEST 14: Rejected request");

const rejectedRequest =
  makeRequest({
    id: 14,

    studentId:
      "2026-001",

    borrowDate:
      "2026-08-20",

    returnDate:
      "2026-08-25",

    status:
      "Rejected",

    items: [
      {
        inventoryId: 1,
        quantity: 1,
      },
    ],
  });


const rejectedResult =
  detectBorrowingConflicts({
    request:
      overlappingRequest,

    existingRequests: [
      rejectedRequest,
    ],

    validation: {
      valid: true,
      reasons: [],
    },
  });


assert(
  rejectedResult.length === 0,
  "Rejected request is ignored"
);


/* ============================================================
   TEST 15
   ACTIVE STATUSES
============================================================ */

console.log("");
console.log("TEST 15: Active statuses");

assert(
  isActiveStatus("Pending"),
  "Pending is active"
);

assert(
  isActiveStatus("Validated"),
  "Validated is active"
);

assert(
  isActiveStatus("Approved"),
  "Approved is active"
);

assert(
  isActiveStatus("Borrowed"),
  "Borrowed is active"
);

assert(
  !isActiveStatus("Rejected"),
  "Rejected is inactive"
);

assert(
  !isActiveStatus("Returned"),
  "Returned is inactive"
);


/* ============================================================
   TEST 16
   INSUFFICIENT INVENTORY
============================================================ */

console.log("");
console.log("TEST 16: Insufficient inventory");

const insufficientValidation = {
  valid: false,

  reasons: [
    {
      code:
        "INSUFFICIENT_INVENTORY",

      inventoryId:
        1,

      requestedQuantity:
        10,

      availableQuantity:
        2,

      message:
        "Only 2 units are available.",
    },
  ],
};


const insufficientResult =
  detectBorrowingConflicts({
    request:
      makeRequest({
        id: 16,

        studentId:
          "2026-500",

        borrowDate:
          "2026-09-10",

        returnDate:
          "2026-09-12",

        items: [
          {
            inventoryId: 1,
            quantity: 10,
          },
        ],
      }),

    existingRequests: [],

    validation:
      insufficientValidation,
  });


assert(
  insufficientResult.some(
    (conflict) =>
      conflict.code ===
      "INSUFFICIENT_INVENTORY"
  ),
  "Insufficient inventory is promoted to conflict"
);


/* ============================================================
   TEST 17
   MULTIPLE CONFLICTS
============================================================ */

console.log("");
console.log("TEST 17: Multiple conflicts");

const multipleConflictRequest =
  makeRequest({
    id: 17,

    studentId:
      "2026-001",

    borrowDate:
      "2026-08-20",

    returnDate:
      "2026-08-22",

    /*
     * IMPORTANT:
     *
     * Must exactly match requestA
     * so that this becomes a duplicate.
     */
    items: [
      {
        inventoryId: 1,
        quantity: 2,
      },

      {
        inventoryId: 2,
        quantity: 1,
      },
    ],
  });


const multipleConflictResult =
  detectBorrowingConflicts({
    request:
      multipleConflictRequest,

    existingRequests: [
      requestA,
    ],

    validation: {
      valid: false,

      reasons: [
        {
          code:
            "INSUFFICIENT_INVENTORY",

          inventoryId:
            1,

          requestedQuantity:
            2,

          availableQuantity:
            0,

          message:
            "No inventory available.",
        },
      ],
    },
  });


assert(
  multipleConflictResult.some(
    (conflict) =>
      conflict.code ===
      "DUPLICATE_BORROWING_REQUEST"
  ),
  "Duplicate conflict detected"
);


assert(
  multipleConflictResult.some(
    (conflict) =>
      conflict.code ===
      "INSUFFICIENT_INVENTORY"
  ),
  "Inventory conflict detected"
);


/* ============================================================
   TEST 18
   VALID REQUEST
============================================================ */

console.log("");
console.log("TEST 18: Completely valid request");

const validCleanRequest =
  makeRequest({
    id: 18,

    studentId:
      "2026-888",

    borrowDate:
      "2026-09-10",

    returnDate:
      "2026-09-12",

    status:
      "Pending",

    items: [
      {
        inventoryId: 100,
        quantity: 1,
      },
    ],
  });


const validCleanResult =
  detectBorrowingConflicts({
    request:
      validCleanRequest,

    existingRequests: [
      requestA,
      rejectedRequest,
      returnedRequest,
    ],

    validation: {
      valid: true,
      reasons: [],
    },
  });


assert(
  validCleanResult.length === 0,
  "Valid request produces zero conflicts"
);


/* ============================================================
   FINAL
============================================================ */

console.log("");
console.log("========================================");

console.log(
  "✅ ALL CONFLICT DETECTION TESTS PASSED"
);

console.log("========================================");
console.log("");