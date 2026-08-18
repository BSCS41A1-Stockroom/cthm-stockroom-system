"use strict";

/**
 * ============================================================
 * CTHM STOCKROOM - INTERVAL TREE TEST
 * ============================================================
 *
 * Tests:
 * 1. Date conversion
 * 2. Basic overlap
 * 3. Non-overlapping dates
 * 4. Inclusive date overlap
 * 5. Interval tree insertion
 * 6. Search one overlap
 * 7. Search all overlaps
 * 8. No overlap
 * 9. Tree clear
 * 10. Tree size
 * 11. Invalid date rejection
 * 12. Invalid date range rejection
 * 13. Multiple overlapping intervals
 * ============================================================
 */

const {
  IntervalTree,
  intervalsOverlap,
  dateToNumber,
} = require("./intervalTree");


/* ============================================================
   ASSERT HELPER
============================================================ */

function assert(condition, message) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }

  console.log(`✅ ${message}`);
}


/* ============================================================
   TEST HEADER
============================================================ */

console.log("");
console.log("========================================");
console.log("CTHM STOCKROOM - INTERVAL TREE TEST");
console.log("========================================");
console.log("");


/* ============================================================
   TEST 1
   DATE CONVERSION
============================================================ */

console.log("TEST 1: Date conversion");

const date1 =
  dateToNumber("2026-08-20");

const date2 =
  dateToNumber("2026-08-20");

const date3 =
  dateToNumber("2026-08-21");


assert(
  date1 === date2,
  "Same dates produce the same numeric value"
);


assert(
  date3 > date1,
  "Later date produces a larger numeric value"
);


/* ============================================================
   TEST 2
   BASIC OVERLAP
============================================================ */

console.log("");
console.log("TEST 2: Basic overlap");


const intervalA = {
  startValue:
    dateToNumber("2026-08-20"),

  endValue:
    dateToNumber("2026-08-22"),
};


const intervalB = {
  startValue:
    dateToNumber("2026-08-21"),

  endValue:
    dateToNumber("2026-08-25"),
};


assert(
  intervalsOverlap(
    intervalA,
    intervalB
  ),
  "Overlapping date ranges are detected"
);


/* ============================================================
   TEST 3
   NON-OVERLAPPING
============================================================ */

console.log("");
console.log("TEST 3: Non-overlapping dates");


const intervalC = {
  startValue:
    dateToNumber("2026-08-23"),

  endValue:
    dateToNumber("2026-08-25"),
};


assert(
  !intervalsOverlap(
    intervalA,
    intervalC
  ),
  "Non-overlapping date ranges are not detected"
);


/* ============================================================
   TEST 4
   INCLUSIVE OVERLAP
============================================================ */

console.log("");
console.log("TEST 4: Inclusive date overlap");


const intervalD = {
  startValue:
    dateToNumber("2026-08-22"),

  endValue:
    dateToNumber("2026-08-25"),
};


assert(
  intervalsOverlap(
    intervalA,
    intervalD
  ),
  "Same-day boundary is correctly treated as overlap"
);


/* ============================================================
   TEST 5
   INTERVAL TREE INSERTION
============================================================ */

console.log("");
console.log("TEST 5: Interval tree insertion");


const tree =
  new IntervalTree();


tree.insert({
  borrowDate:
    "2026-08-20",

  returnDate:
    "2026-08-22",

  data: {
    id: 1,
    studentId: "2024001",
  },
});


tree.insert({
  borrowDate:
    "2026-08-25",

  returnDate:
    "2026-08-28",

  data: {
    id: 2,
    studentId: "2024002",
  },
});


tree.insert({
  borrowDate:
    "2026-08-21",

  returnDate:
    "2026-08-24",

  data: {
    id: 3,
    studentId: "2024003",
  },
});


assert(
  tree.getSize() === 3,
  "Three intervals inserted"
);


/* ============================================================
   TEST 6
   SEARCH ONE OVERLAP
============================================================ */

console.log("");
console.log("TEST 6: Search one overlap");


const oneOverlap =
  tree.search({
    borrowDate:
      "2026-08-21",

    returnDate:
      "2026-08-23",
  });


assert(
  oneOverlap !== null,
  "Search found an overlap"
);


assert(
  oneOverlap.data != null,
  "Overlap contains original request data"
);


/* ============================================================
   TEST 7
   SEARCH ALL OVERLAPS
============================================================ */

console.log("");
console.log("TEST 7: Search all overlaps");


const allOverlaps =
  tree.searchAll({
    borrowDate:
      "2026-08-21",

    returnDate:
      "2026-08-26",
  });


console.log(
  `Found ${allOverlaps.length} overlaps`
);


assert(
  allOverlaps.length === 3,
  "SearchAll found all expected overlaps"
);


/* ============================================================
   TEST 8
   NO OVERLAP
============================================================ */

console.log("");
console.log("TEST 8: No overlap");


const noOverlap =
  tree.searchAll({
    borrowDate:
      "2026-09-01",

    returnDate:
      "2026-09-05",
  });


assert(
  noOverlap.length === 0,
  "No overlap correctly returns zero results"
);


/* ============================================================
   TEST 9
   TREE SIZE
============================================================ */

console.log("");
console.log("TEST 9: Tree size");


assert(
  tree.getSize() === 3,
  "Tree contains exactly three intervals"
);


/* ============================================================
   TEST 10
   TREE TO ARRAY
============================================================ */

console.log("");
console.log("TEST 10: Convert tree to array");


const intervals =
  tree.toArray();


assert(
  Array.isArray(intervals),
  "toArray returns an array"
);


assert(
  intervals.length === 3,
  "toArray returns all three intervals"
);


/* ============================================================
   TEST 11
   INVALID START DATE
============================================================ */

console.log("");
console.log("TEST 11: Invalid start date rejection");


let invalidStartCaught =
  false;


try {

  tree.insert({
    borrowDate:
      "INVALID-DATE",

    returnDate:
      "2026-08-25",

    data: {
      id: 99,
    },
  });

} catch (error) {

  invalidStartCaught =
    error instanceof TypeError;

}


assert(
  invalidStartCaught,
  "Invalid start date is rejected"
);


/* ============================================================
   TEST 12
   INVALID END DATE
============================================================ */

console.log("");
console.log("TEST 12: Invalid end date rejection");


let invalidEndCaught =
  false;


try {

  tree.insert({
    borrowDate:
      "2026-08-20",

    returnDate:
      "INVALID-DATE",

    data: {
      id: 100,
    },
  });

} catch (error) {

  invalidEndCaught =
    error instanceof TypeError;

}


assert(
  invalidEndCaught,
  "Invalid end date is rejected"
);


/* ============================================================
   TEST 13
   START AFTER END
============================================================ */

console.log("");
console.log("TEST 13: Invalid date range rejection");


let invalidRangeCaught =
  false;


try {

  tree.insert({
    borrowDate:
      "2026-08-30",

    returnDate:
      "2026-08-20",

    data: {
      id: 101,
    },
  });

} catch (error) {

  invalidRangeCaught =
    error instanceof TypeError;

}


assert(
  invalidRangeCaught,
  "Start date after end date is rejected"
);


/* ============================================================
   TEST 14
   MULTIPLE OVERLAPS
============================================================ */

console.log("");
console.log("TEST 14: Multiple overlapping intervals");


const secondTree =
  new IntervalTree();


secondTree.insert({
  borrowDate:
    "2026-08-01",

  returnDate:
    "2026-08-10",

  data: {
    id: 1,
  },
});


secondTree.insert({
  borrowDate:
    "2026-08-05",

  returnDate:
    "2026-08-15",

  data: {
    id: 2,
  },
});


secondTree.insert({
  borrowDate:
    "2026-08-08",

  returnDate:
    "2026-08-20",

  data: {
    id: 3,
  },
});


secondTree.insert({
  borrowDate:
    "2026-08-25",

  returnDate:
    "2026-08-30",

  data: {
    id: 4,
  },
});


const multipleOverlaps =
  secondTree.searchAll({
    borrowDate:
      "2026-08-07",

    returnDate:
      "2026-08-09",
  });


console.log(
  `Found ${multipleOverlaps.length} overlapping intervals`
);


assert(
  multipleOverlaps.length === 3,
  "Multiple overlapping intervals are detected"
);


/* ============================================================
   TEST 15
   SEARCH ONE WITH NO RESULT
============================================================ */

console.log("");
console.log("TEST 15: Search one with no result");


const noSingleOverlap =
  secondTree.search({
    borrowDate:
      "2026-09-01",

    returnDate:
      "2026-09-05",
  });


assert(
  noSingleOverlap === null,
  "Single overlap search returns null when no conflict exists"
);


/* ============================================================
   TEST 16
   CLEAR TREE
============================================================ */

console.log("");
console.log("TEST 16: Clear tree");


tree.clear();


assert(
  tree.getSize() === 0,
  "Tree cleared successfully"
);


assert(
  tree.toArray().length === 0,
  "Cleared tree contains no intervals"
);


/* ============================================================
   FINAL RESULT
============================================================ */

console.log("");
console.log("========================================");
console.log("ALL INTERVAL TREE TESTS PASSED");
console.log("========================================");
console.log("");