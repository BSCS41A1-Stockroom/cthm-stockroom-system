"use strict";

const ACTIVE_BORROWING_STATUSES = Object.freeze(["Pending", "Validated", "Approved", "Borrowed"]);
const ACTIVE_STATUS_SET = new Set(ACTIVE_BORROWING_STATUSES);

function datesOverlap(left, right) {
  return left.borrowDate <= right.returnDate && right.borrowDate <= left.returnDate;
}

function itemSignature(items) {
  if (!Array.isArray(items)) return "";
  const quantitiesById = new Map();
  for (const item of items) {
    const inventoryId = String(item.inventoryId);
    quantitiesById.set(inventoryId, (quantitiesById.get(inventoryId) ?? 0) + Number(item.quantity));
  }
  const entries = [...quantitiesById.entries()]
    .sort(([leftId, leftQuantity], [rightId, rightQuantity]) =>
      leftId.localeCompare(rightId) || leftQuantity - rightQuantity
    );
  return JSON.stringify(entries);
}

function studentKey(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isDuplicate(request, existing) {
  return studentKey(request.studentId) !== ""
    && studentKey(request.studentId) === studentKey(existing.studentId)
    && request.borrowDate === existing.borrowDate
    && request.returnDate === existing.returnDate
    && itemSignature(request.items) === itemSignature(existing.items);
}

function detectBorrowingConflicts({ request, existingRequests = [], validation }) {
  const conflicts = [];
  const activeOverlaps = existingRequests.filter((existing) =>
    existing
    && ACTIVE_STATUS_SET.has(existing.status)
    && studentKey(request.studentId) !== ""
    && studentKey(request.studentId) === studentKey(existing.studentId)
    && datesOverlap(request, existing)
  );
  const duplicates = activeOverlaps.filter((existing) => isDuplicate(request, existing));

  for (const duplicate of duplicates) {
    conflicts.push({
      code: "DUPLICATE_BORROWING_REQUEST",
      requestId: duplicate.id,
      message: `This borrowing request duplicates active request '${duplicate.id}'.`,
    });
  }

  for (const existing of activeOverlaps.filter((entry) => !duplicates.includes(entry))) {
    conflicts.push({
      code: "BORROWING_SCHEDULE_OVERLAP",
      requestId: existing.id,
      borrowDate: existing.borrowDate,
      returnDate: existing.returnDate,
      message: `The borrowing period overlaps active request '${existing.id}'.`,
    });
  }

  for (const reason of validation?.reasons ?? []) {
    if (reason.code === "INSUFFICIENT_INVENTORY") conflicts.push({ ...reason });
  }

  return Object.freeze(conflicts);
}

module.exports = {
  ACTIVE_BORROWING_STATUSES,
  datesOverlap,
  detectBorrowingConflicts,
  isDuplicate,
  itemSignature,
  studentKey,
};
