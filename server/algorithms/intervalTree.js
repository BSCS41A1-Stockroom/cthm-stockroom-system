"use strict";

/**
 * ============================================================
 * CTHM STOCKROOM - INTERVAL TREE
 * ============================================================
 *
 * Purpose:
 * Efficiently detect overlapping borrowing date intervals.
 *
 * Each interval represents:
 *
 *   [borrowDate, returnDate]
 *
 * The interval tree is used to quickly find existing borrowing
 * requests that overlap a requested borrowing period.
 *
 * This is especially useful when the database contains many
 * borrowing requests.
 *
 * Complexity:
 *
 *   Insert:  O(log n) average
 *   Search:  O(log n + k) average
 *
 * where k = number of overlapping intervals returned.
 * ============================================================
 */


/* ============================================================
   DATE HELPERS
============================================================ */

/**
 * Convert YYYY-MM-DD into an integer day value.
 *
 * Using UTC avoids timezone-related problems.
 */
function dateToNumber(date) {
  if (typeof date !== "string") {
    return Number.NaN;
  }

  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (!match) {
    return Number.NaN;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const timestamp =
    Date.UTC(year, month - 1, day);

  if (Number.isNaN(timestamp)) {
    return Number.NaN;
  }

  const parsed =
    new Date(timestamp);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return Number.NaN;
  }

  return Math.floor(
    timestamp / 86400000
  );
}


/* ============================================================
   INTERVAL NORMALIZATION
============================================================ */

function normalizeInterval(interval) {
  if (
    !interval ||
    typeof interval !== "object"
  ) {
    throw new TypeError(
      "interval must be an object"
    );
  }

  const start =
    interval.borrowDate ??
    interval.startDate ??
    interval.start_date ??
    interval.borrow_date;

  const end =
    interval.returnDate ??
    interval.endDate ??
    interval.end_date ??
    interval.return_date;

  const startValue =
    dateToNumber(start);

  const endValue =
    dateToNumber(end);

  if (Number.isNaN(startValue)) {
    throw new TypeError(
      "interval start date must be YYYY-MM-DD"
    );
  }

  if (Number.isNaN(endValue)) {
    throw new TypeError(
      "interval end date must be YYYY-MM-DD"
    );
  }

  if (startValue > endValue) {
    throw new TypeError(
      "interval start date must not be after end date"
    );
  }

  return {
    ...interval,

    startDate: start,
    endDate: end,

    startValue,
    endValue,
  };
}


/* ============================================================
   OVERLAP
============================================================ */

/**
 * Inclusive date interval overlap.
 *
 * Example:
 *
 * A = 2026-08-20 → 2026-08-22
 * B = 2026-08-22 → 2026-08-24
 *
 * These overlap because borrowing dates are inclusive.
 */
function intervalsOverlap(
  left,
  right
) {
  return (
    left.startValue <= right.endValue &&
    right.startValue <= left.endValue
  );
}


/* ============================================================
   TREE NODE
============================================================ */

class IntervalTreeNode {

  constructor(interval) {
    this.interval =
      interval;

    this.left =
      null;

    this.right =
      null;

    /**
     * Maximum end value contained
     * anywhere in this subtree.
     */
    this.maxEnd =
      interval.endValue;
  }
}


/* ============================================================
   INTERVAL TREE
============================================================ */

class IntervalTree {

  constructor() {
    this.root = null;

    this.size = 0;
  }


  /* ==========================================================
     INSERT
  ========================================================== */

  insert(interval) {

    const normalized =
      normalizeInterval(
        interval
      );

    const node =
      new IntervalTreeNode(
        normalized
      );

    if (!this.root) {
      this.root = node;

      this.size++;

      return this;
    }

    this.root =
      this.#insertNode(
        this.root,
        node
      );

    this.size++;

    return this;
  }


  #insertNode(
    current,
    node
  ) {

    if (
      node.interval.startValue <
      current.interval.startValue
    ) {

      if (!current.left) {
        current.left = node;
      } else {
        current.left =
          this.#insertNode(
            current.left,
            node
          );
      }

    } else {

      if (!current.right) {
        current.right = node;
      } else {
        current.right =
          this.#insertNode(
            current.right,
            node
          );
      }
    }


    current.maxEnd =
      Math.max(
        current.interval.endValue,
        current.left
          ? current.left.maxEnd
          : Number.NEGATIVE_INFINITY,
        current.right
          ? current.right.maxEnd
          : Number.NEGATIVE_INFINITY
      );

    return current;
  }


  /* ==========================================================
     SEARCH ONE OVERLAP
  ========================================================== */

  search(interval) {

    const normalized =
      normalizeInterval(
        interval
      );

    let current =
      this.root;


    while (current) {

      if (
        intervalsOverlap(
          normalized,
          current.interval
        )
      ) {
        return current.interval;
      }


      /**
       * If the left subtree has a possible
       * end date that reaches the requested
       * interval, search left.
       */
      if (
        current.left &&
        current.left.maxEnd >=
          normalized.startValue
      ) {

        current =
          current.left;

      } else {

        current =
          current.right;
      }
    }


    return null;
  }


  /* ==========================================================
     SEARCH ALL OVERLAPS
  ========================================================== */

  searchAll(interval) {

    const normalized =
      normalizeInterval(
        interval
      );

    const results = [];

    this.#searchAll(
      this.root,
      normalized,
      results
    );

    return results;
  }


  #searchAll(
    current,
    target,
    results
  ) {

    if (!current) {
      return;
    }


    /**
     * Search left subtree only if its
     * maximum end can still overlap.
     */
    if (
      current.left &&
      current.left.maxEnd >=
        target.startValue
    ) {

      this.#searchAll(
        current.left,
        target,
        results
      );
    }


    if (
      intervalsOverlap(
        target,
        current.interval
      )
    ) {

      results.push(
        current.interval
      );
    }


    /**
     * Search right subtree only if the
     * right subtree can contain an interval
     * beginning before the target ends.
     */
    if (
      current.right &&
      current.interval.startValue <=
        target.endValue
    ) {

      this.#searchAll(
        current.right,
        target,
        results
      );
    }
  }


  /* ==========================================================
     REMOVE
  ========================================================== */

  remove(interval) {

    const normalized =
      normalizeInterval(
        interval
      );

    const before =
      this.size;

    this.root =
      this.#removeNode(
        this.root,
        normalized
      );

    if (
      this.size === before &&
      this.root !== null
    ) {
      return false;
    }

    return true;
  }


  #removeNode(
    current,
    target
  ) {

    if (!current) {
      return null;
    }


    if (
      target.startValue <
      current.interval.startValue
    ) {

      current.left =
        this.#removeNode(
          current.left,
          target
        );

    } else if (
      target.startValue >
      current.interval.startValue
    ) {

      current.right =
        this.#removeNode(
          current.right,
          target
        );

    } else if (
      target.endValue ===
        current.interval.endValue
    ) {

      /**
       * Case 1:
       * no left child.
       */
      if (!current.left) {

        this.size--;

        return current.right;
      }


      /**
       * Case 2:
       * no right child.
       */
      if (!current.right) {

        this.size--;

        return current.left;
      }


      /**
       * Case 3:
       * two children.
       *
       * Replace with inorder successor.
       */
      const successor =
        this.#minimum(
          current.right
        );

      current.interval =
        successor.interval;

      current.right =
        this.#removeNode(
          current.right,
          successor.interval
        );
    }


    current.maxEnd =
      Math.max(
        current.interval.endValue,
        current.left
          ? current.left.maxEnd
          : Number.NEGATIVE_INFINITY,
        current.right
          ? current.right.maxEnd
          : Number.NEGATIVE_INFINITY
      );

    return current;
  }


  #minimum(node) {

    let current = node;

    while (current.left) {
      current =
        current.left;
    }

    return current;
  }


  /* ==========================================================
     CLEAR
  ========================================================== */

  clear() {

    this.root = null;

    this.size = 0;

    return this;
  }


  /* ==========================================================
     GET SIZE
  ========================================================== */

  getSize() {

    return this.size;
  }


  /* ==========================================================
     GET ALL INTERVALS
  ========================================================== */

  toArray() {

    const result = [];

    this.#inOrder(
      this.root,
      result
    );

    return result;
  }


  #inOrder(
    current,
    result
  ) {

    if (!current) {
      return;
    }

    this.#inOrder(
      current.left,
      result
    );

    result.push(
      current.interval
    );

    this.#inOrder(
      current.right,
      result
    );
  }
}


/* ============================================================
   BUILD TREE FROM REQUESTS
============================================================ */

/**
 * Convenience function for the CTHM Stockroom.
 *
 * Example:
 *
 * const tree =
 *   buildBorrowingIntervalTree(
 *     existingRequests
 *   );
 */
function buildBorrowingIntervalTree(
  requests = []
) {

  const tree =
    new IntervalTree();

  for (
    const request
    of requests
  ) {

    if (!request) {
      continue;
    }

    try {

      tree.insert({
        ...request,

        borrowDate:
          request.borrowDate ??
          request.borrow_date,

        returnDate:
          request.returnDate ??
          request.return_date,
      });

    } catch {
      /**
       * Invalid records are ignored here.
       *
       * Database-level validation should already
       * reject malformed borrowing records.
       */
    }
  }

  return tree;
}


/* ============================================================
   FIND BORROWING OVERLAPS
============================================================ */

function findBorrowingOverlaps(
  requests,
  borrowDate,
  returnDate
) {

  const tree =
    buildBorrowingIntervalTree(
      requests
    );

  return tree.searchAll({
    borrowDate,
    returnDate,
  });
}


/* ============================================================
   EXPORTS
============================================================ */

module.exports = {

  IntervalTree,

  IntervalTreeNode,

  buildBorrowingIntervalTree,

  findBorrowingOverlaps,

  intervalsOverlap,

  dateToNumber,

  normalizeInterval,
};