"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  IntervalTree,
  buildBorrowingIntervalTree,
  findBorrowingOverlaps,
  intervalsOverlap,
  dateToNumber,
  normalizeInterval,
} = require("./intervalTree");


/* ============================================================
   DATE
============================================================ */

test("converts valid date to numeric day", () => {

  const value =
    dateToNumber("2026-08-20");

  assert.equal(
    Number.isInteger(value),
    true
  );
});


test("rejects invalid date", () => {

  const value =
    dateToNumber("2026-99-99");

  assert.equal(
    Number.isNaN(value),
    true
  );
});


/* ============================================================
   NORMALIZATION
============================================================ */

test("normalizes borrowing interval", () => {

  const interval =
    normalizeInterval({
      borrowDate: "2026-08-20",
      returnDate: "2026-08-22",
    });

  assert.equal(
    interval.startDate,
    "2026-08-20"
  );

  assert.equal(
    interval.endDate,
    "2026-08-22"
  );

  assert.equal(
    interval.startValue <=
      interval.endValue,
    true
  );
});


test("rejects reversed interval", () => {

  assert.throws(
    () =>
      normalizeInterval({
        borrowDate: "2026-08-22",
        returnDate: "2026-08-20",
      }),
    TypeError
  );
});


/* ============================================================
   OVERLAP
============================================================ */

test("detects overlapping inclusive dates", () => {

  const result =
    intervalsOverlap(
      normalizeInterval({
        borrowDate: "2026-08-20",
        returnDate: "2026-08-22",
      }),
      normalizeInterval({
        borrowDate: "2026-08-22",
        returnDate: "2026-08-25",
      })
    );

  assert.equal(
    result,
    true
  );
});


test("detects non-overlapping dates", () => {

  const result =
    intervalsOverlap(
      normalizeInterval({
        borrowDate: "2026-08-20",
        returnDate: "2026-08-22",
      }),
      normalizeInterval({
        borrowDate: "2026-08-23",
        returnDate: "2026-08-25",
      })
    );

  assert.equal(
    result,
    false
  );
});


/* ============================================================
   INSERT
============================================================ */

test("inserts intervals into tree", () => {

  const tree =
    new IntervalTree();

  tree.insert({
    id: "REQ-001",
    borrowDate: "2026-08-20",
    returnDate: "2026-08-22",
  });

  tree.insert({
    id: "REQ-002",
    borrowDate: "2026-08-25",
    returnDate: "2026-08-27",
  });

  assert.equal(
    tree.getSize(),
    2
  );
});


/* ============================================================
   SEARCH
============================================================ */

test("finds overlapping interval", () => {

  const tree =
    new IntervalTree();

  tree.insert({
    id: "REQ-001",
    borrowDate: "2026-08-20",
    returnDate: "2026-08-22",
  });

  const result =
    tree.search({
      borrowDate: "2026-08-21",
      returnDate: "2026-08-24",
    });

  assert.ok(result);

  assert.equal(
    result.id,
    "REQ-001"
  );
});


test("returns null when no interval overlaps", () => {

  const tree =
    new IntervalTree();

  tree.insert({
    id: "REQ-001",
    borrowDate: "2026-08-20",
    returnDate: "2026-08-22",
  });

  const result =
    tree.search({
      borrowDate: "2026-08-23",
      returnDate: "2026-08-25",
    });

  assert.equal(
    result,
    null
  );
});


/* ============================================================
   SEARCH ALL
============================================================ */

test("finds all overlapping intervals", () => {

  const tree =
    new IntervalTree();

  tree.insert({
    id: "REQ-001",
    borrowDate: "2026-08-20",
    returnDate: "2026-08-22",
  });

  tree.insert({
    id: "REQ-002",
    borrowDate: "2026-08-21",
    returnDate: "2026-08-24",
  });

  tree.insert({
    id: "REQ-003",
    borrowDate: "2026-08-30",
    returnDate: "2026-09-01",
  });

  const results =
    tree.searchAll({
      borrowDate: "2026-08-21",
      returnDate: "2026-08-23",
    });

  assert.equal(
    results.length,
    2
  );

  assert.deepEqual(
    results.map(
      (item) => item.id
    ).sort(),
    [
      "REQ-001",
      "REQ-002",
    ]
  );
});


/* ============================================================
   BACK-TO-BACK
============================================================ */

test("allows non-overlapping consecutive dates", () => {

  const tree =
    new IntervalTree();

  tree.insert({
    id: "REQ-001",
    borrowDate: "2026-08-20",
    returnDate: "2026-08-21",
  });

  const result =
    tree.search({
      borrowDate: "2026-08-22",
      returnDate: "2026-08-23",
    });

  assert.equal(
    result,
    null
  );
});


/* ============================================================
   BUILD FROM REQUESTS
============================================================ */

test("builds tree from borrowing requests", () => {

  const requests = [
    {
      id: "REQ-001",
      borrowDate: "2026-08-20",
      returnDate: "2026-08-22",
    },
    {
      id: "REQ-002",
      borrowDate: "2026-08-25",
      returnDate: "2026-08-27",
    },
  ];

  const tree =
    buildBorrowingIntervalTree(
      requests
    );

  assert.equal(
    tree.getSize(),
    2
  );
});


/* ============================================================
   DATABASE STYLE FIELDS
============================================================ */

test("supports snake_case database fields", () => {

  const tree =
    buildBorrowingIntervalTree([
      {
        id: "REQ-001",

        borrow_date:
          "2026-08-20",

        return_date:
          "2026-08-22",
      },
    ]);

  const result =
    tree.search({
      borrowDate: "2026-08-21",
      returnDate: "2026-08-21",
    });

  assert.ok(result);

  assert.equal(
    result.id,
    "REQ-001"
  );
});


/* ============================================================
   CONVENIENCE FUNCTION
============================================================ */

test("findBorrowingOverlaps returns matching requests", () => {

  const requests = [
    {
      id: "REQ-001",

      borrowDate:
        "2026-08-20",

      returnDate:
        "2026-08-22",
    },

    {
      id: "REQ-002",

      borrowDate:
        "2026-08-30",

      returnDate:
        "2026-09-01",
    },
  ];

  const results =
    findBorrowingOverlaps(
      requests,
      "2026-08-21",
      "2026-08-23"
    );

  assert.equal(
    results.length,
    1
  );

  assert.equal(
    results[0].id,
    "REQ-001"
  );
});


/* ============================================================
   REMOVE
============================================================ */

test("removes an interval from tree", () => {

  const tree =
    new IntervalTree();

  const interval = {
    id: "REQ-001",

    borrowDate:
      "2026-08-20",

    returnDate:
      "2026-08-22",
  };

  tree.insert(interval);

  assert.equal(
    tree.getSize(),
    1
  );

  const removed =
    tree.remove(interval);

  assert.equal(
    removed,
    true
  );

  assert.equal(
    tree.getSize(),
    0
  );

  assert.equal(
    tree.search({
      borrowDate:
        "2026-08-21",

      returnDate:
        "2026-08-21",
    }),
    null
  );
});


/* ============================================================
   CLEAR
============================================================ */

test("clears all intervals", () => {

  const tree =
    new IntervalTree();

  tree.insert({
    id: "REQ-001",
    borrowDate: "2026-08-20",
    returnDate: "2026-08-22",
  });

  tree.insert({
    id: "REQ-002",
    borrowDate: "2026-08-25",
    returnDate: "2026-08-27",
  });

  tree.clear();

  assert.equal(
    tree.getSize(),
    0
  );

  assert.deepEqual(
    tree.toArray(),
    []
  );
});