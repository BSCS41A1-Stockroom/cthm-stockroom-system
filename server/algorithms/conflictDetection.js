"use strict";

/**
 * ============================================================
 * CTHM STOCKROOM - BORROWING CONFLICT DETECTION
 * ============================================================
 *
 * Uses:
 * - Interval Tree for date-range overlap detection
 * - Active borrowing status filtering
 * - Duplicate request detection
 * - Student-based conflict detection
 * - CSP inventory violations promotion
 *
 * All dates are canonicalized to YYYY-MM-DD before being
 * passed to intervalTree.js.
 * ============================================================
 */

const { IntervalTree } = require("./intervalTree");


/* ============================================================
   ACTIVE BORROWING STATUSES
============================================================ */

const ACTIVE_BORROWING_STATUSES = Object.freeze([
  "Pending",
  "Validated",
  "Approved",
  "Borrowed",
]);

const ACTIVE_STATUS_SET =
  new Set(ACTIVE_BORROWING_STATUSES);


/* ============================================================
   STATUS HELPERS
============================================================ */

function normalizeStatus(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}


function isActiveStatus(status) {
  return ACTIVE_STATUS_SET.has(
    String(status ?? "").trim()
  );
}


/* ============================================================
   DATE NORMALIZATION
============================================================ */

/**
 * Convert any supported database/API date into:
 *
 * YYYY-MM-DD
 *
 * Supported:
 * - YYYY-MM-DD
 * - YYYY-MM-DDTHH:mm:ss
 * - ISO date strings
 * - JavaScript Date objects
 * - PostgreSQL DATE values returned as Date objects
 */

function normalizeDate(value) {
  if (value == null) {
    return "";
  }

  /* ----------------------------------------------------------
     JavaScript Date
  ---------------------------------------------------------- */

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return "";
    }

    return value.toISOString().slice(0, 10);
  }


  /* ----------------------------------------------------------
     String
  ---------------------------------------------------------- */

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return "";
    }

    /*
     * Already YYYY-MM-DD.
     */
    const dateOnlyMatch =
      trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);

    if (dateOnlyMatch) {
      return dateOnlyMatch[1];
    }

    /*
     * ISO / timestamp:
     *
     * 2026-08-20T00:00:00.000Z
     * 2026-08-20 00:00:00
     */
    const datePrefixMatch =
      trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s]|$)/);

    if (datePrefixMatch) {
      return datePrefixMatch[1];
    }

    /*
     * Last-resort parsing.
     */
    const parsed = new Date(trimmed);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }

    return "";
  }


  /* ----------------------------------------------------------
     Other values
  ---------------------------------------------------------- */

  return "";
}


/* ============================================================
   DATE VALIDATION
============================================================ */

function isValidDateOnly(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  );
}


/* ============================================================
   DATE OVERLAP
============================================================ */

/**
 * Inclusive date overlap.
 *
 * Example:
 *
 * A: 2026-08-20 -> 2026-08-22
 * B: 2026-08-22 -> 2026-08-25
 *
 * Result:
 * true
 */

function datesOverlap(left, right) {
  if (!left || !right) {
    return false;
  }

  const leftBorrowDate =
    normalizeDate(
      left.borrowDate ??
      left.borrow_date ??
      left.startDate ??
      left.start
    );

  const leftReturnDate =
    normalizeDate(
      left.returnDate ??
      left.return_date ??
      left.endDate ??
      left.end
    );

  const rightBorrowDate =
    normalizeDate(
      right.borrowDate ??
      right.borrow_date ??
      right.startDate ??
      right.start
    );

  const rightReturnDate =
    normalizeDate(
      right.returnDate ??
      right.return_date ??
      right.endDate ??
      right.end
    );

  if (
    !leftBorrowDate ||
    !leftReturnDate ||
    !rightBorrowDate ||
    !rightReturnDate
  ) {
    return false;
  }

  if (
    !isValidDateOnly(leftBorrowDate) ||
    !isValidDateOnly(leftReturnDate) ||
    !isValidDateOnly(rightBorrowDate) ||
    !isValidDateOnly(rightReturnDate)
  ) {
    return false;
  }

  return (
    leftBorrowDate <= rightReturnDate &&
    rightBorrowDate <= leftReturnDate
  );
}


/* ============================================================
   STUDENT KEY
============================================================ */

function studentKey(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}


/* ============================================================
   ITEM SIGNATURE
============================================================ */

function itemSignature(items) {
  if (!Array.isArray(items)) {
    return "";
  }

  const quantitiesById = new Map();

  for (const item of items) {
    if (!item) {
      continue;
    }

    const inventoryId =
      String(
        item.inventoryId ??
        item.inventory_id ??
        ""
      );

    if (!inventoryId) {
      continue;
    }

    const quantity =
      Number(
        item.quantity ??
        item.requestedQuantity ??
        item.requested_quantity ??
        0
      );

    quantitiesById.set(
      inventoryId,
      (
        quantitiesById.get(inventoryId) ?? 0
      ) + quantity
    );
  }

  const entries =
    [...quantitiesById.entries()]
      .sort(
        (
          [leftId, leftQuantity],
          [rightId, rightQuantity]
        ) =>
          leftId.localeCompare(rightId) ||
          leftQuantity - rightQuantity
      );

  return JSON.stringify(entries);
}


/* ============================================================
   REQUEST NORMALIZATION
============================================================ */

function normalizeRequest(request) {
  if (
    !request ||
    typeof request !== "object"
  ) {
    return null;
  }

  const id =
    request.id ??
    request.requestId ??
    request.request_id;

  const studentId =
    request.studentId ??
    request.student_id;

  const borrowDate =
    normalizeDate(
      request.borrowDate ??
      request.borrow_date ??
      request.startDate ??
      request.start
    );

  const returnDate =
    normalizeDate(
      request.returnDate ??
      request.return_date ??
      request.endDate ??
      request.end
    );

  const status =
    request.status ??
    "Pending";

  const rawItems =
    request.items ??
    request.request_items ??
    request.borrowing_items ??
    [];

  const items =
    Array.isArray(rawItems)
      ? rawItems.map((item) => ({
          inventoryId:
            item?.inventoryId ??
            item?.inventory_id,

          quantity:
            Number(
              item?.quantity ??
              item?.requestedQuantity ??
              item?.requested_quantity ??
              0
            ),
        }))
      : [];

  return {
    ...request,

    id,
    studentId,

    borrowDate,
    returnDate,

    status,

    items,
  };
}


/* ============================================================
   DUPLICATE REQUEST
============================================================ */

function isDuplicate(
  request,
  existing
) {
  if (!request || !existing) {
    return false;
  }

  const requestStudent =
    studentKey(
      request.studentId ??
      request.student_id
    );

  const existingStudent =
    studentKey(
      existing.studentId ??
      existing.student_id
    );

  if (
    requestStudent === "" ||
    requestStudent !== existingStudent
  ) {
    return false;
  }

  const requestBorrowDate =
    normalizeDate(
      request.borrowDate ??
      request.borrow_date
    );

  const existingBorrowDate =
    normalizeDate(
      existing.borrowDate ??
      existing.borrow_date
    );

  const requestReturnDate =
    normalizeDate(
      request.returnDate ??
      request.return_date
    );

  const existingReturnDate =
    normalizeDate(
      existing.returnDate ??
      existing.return_date
    );

  if (
    requestBorrowDate !== existingBorrowDate
  ) {
    return false;
  }

  if (
    requestReturnDate !== existingReturnDate
  ) {
    return false;
  }

  return (
    itemSignature(request.items) ===
    itemSignature(existing.items)
  );
}


/* ============================================================
   ACTIVE REQUEST FILTER
============================================================ */

function getActiveRequests(
  request,
  existingRequests
) {
  if (
    !Array.isArray(existingRequests)
  ) {
    return [];
  }

  const currentStudent =
    studentKey(request.studentId);

  return existingRequests
    .map(normalizeRequest)
    .filter(Boolean)
    .filter((existing) => {

      /*
       * Ignore the same request.
       */
      if (
        request.id != null &&
        existing.id != null &&
        String(request.id) ===
          String(existing.id)
      ) {
        return false;
      }

      /*
       * Same student only.
       */
      if (
        currentStudent === "" ||
        currentStudent !==
          studentKey(existing.studentId)
      ) {
        return false;
      }

      /*
       * Active requests only.
       */
      if (
        !isActiveStatus(existing.status)
      ) {
        return false;
      }

      /*
       * Inclusive date overlap.
       */
      if (
        !datesOverlap(
          request,
          existing
        )
      ) {
        return false;
      }

      return true;
    });
}


/* ============================================================
   INTERVAL TREE INTERVAL CREATOR
============================================================ */

/**
 * Creates an interval object compatible with both the
 * date naming used by this module and common IntervalTree
 * implementations.
 *
 * The important fields are:
 *
 * start = YYYY-MM-DD
 * end   = YYYY-MM-DD
 *
 * Additional aliases are harmless and allow compatibility
 * with intervalTree.js implementations that use startDate
 * and endDate.
 */

function createTreeInterval(request) {
  const normalized =
    normalizeRequest(request);

  if (!normalized) {
    return null;
  }

  const start =
    normalizeDate(normalized.borrowDate);

  const end =
    normalizeDate(normalized.returnDate);

  if (
    !isValidDateOnly(start) ||
    !isValidDateOnly(end)
  ) {
    return null;
  }

  if (start > end) {
    return null;
  }

  return {
    start,
    end,

    /*
     * Compatibility aliases.
     */
    startDate: start,
    endDate: end,

    /*
     * Original borrowing request.
     */
    data: normalized,

    request: normalized,
  };
}


/* ============================================================
   INTERVAL TREE BUILDER
============================================================ */

function buildIntervalTree(
  requests = []
) {
  const tree =
    new IntervalTree();

  if (
    !Array.isArray(requests)
  ) {
    return tree;
  }

  for (
    const rawRequest
    of requests
  ) {
    const request =
      normalizeRequest(rawRequest);

    if (!request) {
      continue;
    }

    /*
     * Active status only.
     */
    if (
      !isActiveStatus(request.status)
    ) {
      continue;
    }

    const interval =
      createTreeInterval(request);

    /*
     * Never insert malformed dates
     * into the Interval Tree.
     */
    if (!interval) {
      continue;
    }

    tree.insert(interval);
  }

  return tree;
}


/* ============================================================
   FIND BORROWING OVERLAPS
============================================================ */

function findBorrowingOverlaps(
  tree,
  request
) {
  if (!tree) {
    return [];
  }

  const normalized =
    normalizeRequest(request);

  if (!normalized) {
    return [];
  }

  const interval =
    createTreeInterval(normalized);

  if (!interval) {
    return [];
  }

  let results = [];

  /*
   * IntervalTree implementations may expose
   * searchAll().
   */
  if (
    typeof tree.searchAll === "function"
  ) {
    results =
      tree.searchAll({
        start: interval.start,
        end: interval.end,

        /*
         * Compatibility aliases.
         */
        startDate: interval.start,
        endDate: interval.end,
      }) || [];
  }

  return results
    .map((entry) => {

      /*
       * Standard IntervalTree result.
       */
      if (
        entry &&
        entry.data
      ) {
        return entry.data;
      }

      /*
       * Some implementations may return
       * the original request directly.
       */
      if (
        entry &&
        entry.request
      ) {
        return entry.request;
      }

      return entry;
    })
    .filter(Boolean)
    .map(normalizeRequest)
    .filter(Boolean)
    .filter((existing) =>
      datesOverlap(
        normalized,
        existing
      )
    );
}


/* ============================================================
   CONFLICT DETECTION
============================================================ */

function detectBorrowingConflicts({
  request,
  existingRequests = [],
  validation,
}) {
  const conflicts = [];

  const normalizedRequest =
    normalizeRequest(request);

  if (!normalizedRequest) {
    return Object.freeze(conflicts);
  }

  const normalizedExisting =
    Array.isArray(existingRequests)
      ? existingRequests
          .map(normalizeRequest)
          .filter(Boolean)
      : [];


  /* ==========================================================
     ACTIVE REQUESTS
  ========================================================== */

  const activeOverlaps =
    getActiveRequests(
      normalizedRequest,
      normalizedExisting
    );


  /* ==========================================================
     INTERVAL TREE
  ========================================================== */

  const intervalTree =
    buildIntervalTree(
      activeOverlaps
    );

  const treeOverlaps =
    findBorrowingOverlaps(
      intervalTree,
      normalizedRequest
    );


  /*
   * Remove duplicate object references.
   */
  const uniqueOverlapMap =
    new Map();

  for (
    const existing
    of treeOverlaps
  ) {
    const key =
      existing.id != null
        ? String(existing.id)
        : JSON.stringify({
            studentId:
              existing.studentId,

            borrowDate:
              existing.borrowDate,

            returnDate:
              existing.returnDate,

            items:
              itemSignature(
                existing.items
              ),
          });

    if (
      !uniqueOverlapMap.has(key)
    ) {
      uniqueOverlapMap.set(
        key,
        existing
      );
    }
  }

  const overlapRequests =
    [...uniqueOverlapMap.values()]
      .filter((existing) =>
        datesOverlap(
          normalizedRequest,
          existing
        )
      );


  /* ==========================================================
     DUPLICATES
  ========================================================== */

  const duplicates =
    overlapRequests.filter(
      (existing) =>
        isDuplicate(
          normalizedRequest,
          existing
        )
    );

  const duplicateIds =
    new Set(
      duplicates
        .filter(
          (duplicate) =>
            duplicate.id != null
        )
        .map(
          (duplicate) =>
            String(duplicate.id)
        )
    );


  /* ==========================================================
     DUPLICATE CONFLICTS
  ========================================================== */

  for (
    const duplicate
    of duplicates
  ) {
    conflicts.push({
      code:
        "DUPLICATE_BORROWING_REQUEST",

      requestId:
        duplicate.id,

      message:
        `This borrowing request duplicates active request '${duplicate.id}'.`,
    });
  }


  /* ==========================================================
     SCHEDULE OVERLAPS
  ========================================================== */

  for (
    const existing
    of overlapRequests
  ) {
    /*
     * Duplicate requests must NOT also
     * become schedule-overlap conflicts.
     */
    if (
      existing.id != null &&
      duplicateIds.has(
        String(existing.id)
      )
    ) {
      continue;
    }

    conflicts.push({
      code:
        "BORROWING_SCHEDULE_OVERLAP",

      requestId:
        existing.id,

      borrowDate:
        normalizeDate(
          existing.borrowDate ??
          existing.borrow_date
        ),

      returnDate:
        normalizeDate(
          existing.returnDate ??
          existing.return_date
        ),

      message:
        `The borrowing period overlaps active request '${existing.id}'.`,
    });
  }


  /* ==========================================================
     CSP INVENTORY VIOLATIONS
  ========================================================== */

  for (
    const reason
    of validation?.reasons ?? []
  ) {
    if (
      reason &&
      reason.code ===
        "INSUFFICIENT_INVENTORY"
    ) {
      conflicts.push({
        ...reason,
      });
    }
  }


  /* ==========================================================
     RETURN
  ========================================================== */

  return Object.freeze(conflicts);
}


/* ============================================================
   EXPORTS
============================================================ */

module.exports = {
  ACTIVE_BORROWING_STATUSES,

  ACTIVE_STATUS_SET,

  normalizeDate,

  normalizeRequest,

  normalizeStatus,

  isActiveStatus,

  datesOverlap,

  itemSignature,

  studentKey,

  isDuplicate,

  buildIntervalTree,

  findBorrowingOverlaps,

  detectBorrowingConflicts,
};