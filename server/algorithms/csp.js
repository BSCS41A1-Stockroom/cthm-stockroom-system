"use strict";

/**
 * ============================================================
 * CTHM STOCKROOM - BORROWING CSP
 * ============================================================
 *
 * Constraints:
 * 1. Inventory Capacity
 * 2. Time Overlap
 * 3. Duplicate Request
 * 4. Borrowing Limit
 * 5. Lead Time
 * 6. Return / Outstanding
 * 7. Status
 * 8. Availability Date
 * ============================================================
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;


/* ============================================================
   DEFAULT POLICY
============================================================ */

const DEFAULT_POLICY = Object.freeze({
  maxItemsPerRequest: 10,
  maxQuantityPerStudent: 10,
  leadTimeDays: 2,
  preventOutstandingBorrowing: true,
  timeZone: "Asia/Manila",
});


/* ============================================================
   HELPERS
============================================================ */

function invariant(condition, message) {
  if (!condition) {
    throw new TypeError(message);
  }
}


/* ============================================================
   DATE VALIDATION
============================================================ */

/**
 * Strict YYYY-MM-DD validation.
 *
 * Uses UTC instead of local Date parsing so the result is
 * not affected by the machine's timezone.
 */
function isValidDate(date) {
  if (
    typeof date !== "string" ||
    !DATE_PATTERN.test(date)
  ) {
    return false;
  }

  const [year, month, day] =
    date.split("-").map(Number);

  const parsed =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}


/* ============================================================
   TIME PARSING
============================================================ */

function parseTime(
  time,
  fieldName = "time"
) {
  invariant(
    typeof time === "string" &&
      TIME_PATTERN.test(time),
    `${fieldName} must use HH:mm (24-hour) format`
  );

  const [hour, minute] =
    time.split(":").map(Number);

  return (
    hour * 60 +
    minute
  );
}


/* ============================================================
   TIME INTERVAL OVERLAP
============================================================ */

/**
 * Half-open interval:
 *
 * [start, end)
 *
 * 08:00 - 10:00
 * 10:00 - 12:00
 *
 * => NOT overlapping
 *
 * 08:00 - 10:00
 * 09:00 - 11:00
 *
 * => overlapping
 */

function intervalsOverlap(
  leftStart,
  leftEnd,
  rightStart,
  rightEnd
) {
  return (
    leftStart < rightEnd &&
    rightStart < leftEnd
  );
}


/* ============================================================
   DATE DIFFERENCE
============================================================ */

function dateDifferenceInDays(
  earlierDate,
  laterDate
) {
  invariant(
    isValidDate(earlierDate),
    `Invalid earlier date: ${earlierDate}`
  );

  invariant(
    isValidDate(laterDate),
    `Invalid later date: ${laterDate}`
  );

  const [ey, em, ed] =
    earlierDate.split("-").map(Number);

  const [ly, lm, ld] =
    laterDate.split("-").map(Number);

  const earlier =
    Date.UTC(
      ey,
      em - 1,
      ed
    );

  const later =
    Date.UTC(
      ly,
      lm - 1,
      ld
    );

  return Math.floor(
    (later - earlier) /
      (1000 * 60 * 60 * 24)
  );
}

function dateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}


/* ============================================================
   REQUEST NORMALIZATION
============================================================ */

function normalizeRequest(request) {
  invariant(
    request &&
      typeof request === "object" &&
      !Array.isArray(request),
    "request is required"
  );


  /* ----------------------------------------------------------
     BASIC FIELDS
  ---------------------------------------------------------- */

  const id =
    request.id ??
    request.request_id;

  const studentId =
    request.studentId ??
    request.student_id;

  const borrowDate =
    request.borrowDate ??
    request.borrow_date ??
    request.date;

  const returnDate =
    request.returnDate ??
    request.return_date ??
    borrowDate;

  const startTime =
    request.startTime ??
    request.start_time ??
    null;

  const endTime =
    request.endTime ??
    request.end_time ??
    null;

  const submittedAt =
    request.submittedAt ??
    request.submitted_at ??
    null;

  const purpose =
    request.purpose ??
    request.activity ??
    request.description ??
    "";

  const status =
    request.status ??
    "pending";


  /* ----------------------------------------------------------
     ITEMS
  ---------------------------------------------------------- */

  const items =
    request.items ??
    request.request_items ??
    request.borrowing_items ??
    [];


  /* ----------------------------------------------------------
     REQUIRED FIELDS
  ---------------------------------------------------------- */

  invariant(
    typeof id === "string" &&
      id.trim().length > 0,
    "request.id is required"
  );

  invariant(
    typeof studentId === "string" &&
      studentId.trim().length > 0,
    "request.studentId is required"
  );

  invariant(
    isValidDate(borrowDate),
    "request.borrowDate must be a valid YYYY-MM-DD date"
  );

  if (returnDate != null) {
    invariant(
      isValidDate(returnDate),
      "request.returnDate must be a valid YYYY-MM-DD date"
    );
  }

  invariant(
    Array.isArray(items) &&
      items.length > 0,
    "request.items must be a non-empty array"
  );


  /* ----------------------------------------------------------
     RETURN DATE
  ---------------------------------------------------------- */

  const normalizedReturnDate =
    returnDate ?? borrowDate;

  invariant(
    dateDifferenceInDays(
      borrowDate,
      normalizedReturnDate
    ) >= 0,
    "request.returnDate cannot be before request.borrowDate"
  );


  /* ----------------------------------------------------------
     ITEMS
  ---------------------------------------------------------- */

  const normalizedItems =
    items.map(
      (item, index) => {

        invariant(
          item &&
            typeof item === "object" &&
            !Array.isArray(item),
          `items[${index}] must be an object`
        );

        const itemId =
          item.itemId ??
          item.item_id ??
          item.id;

        const quantity =
          item.quantity ??
          item.requestedQuantity ??
          item.requested_quantity;

        invariant(
          typeof itemId === "string" &&
            itemId.trim().length > 0,
          `items[${index}].itemId is required`
        );

        invariant(
          Number.isInteger(quantity) &&
            quantity > 0,
          `items[${index}].quantity must be a positive integer`
        );

        return Object.freeze({
          itemId: itemId.trim(),
          quantity,
        });
      }
    );


  /* ----------------------------------------------------------
     TIME
  ---------------------------------------------------------- */

  let startMinutes = null;
  let endMinutes = null;

  if (startTime != null) {
    startMinutes =
      parseTime(
        startTime,
        "request.startTime"
      );
  }

  if (endTime != null) {
    endMinutes =
      parseTime(
        endTime,
        "request.endTime"
      );
  }

  if (
    startMinutes != null &&
    endMinutes != null
  ) {
    invariant(
      startMinutes < endMinutes,
      "request.endTime must be after request.startTime"
    );
  }


  /* ----------------------------------------------------------
     NORMALIZED REQUEST
  ---------------------------------------------------------- */

  return Object.freeze({
    ...request,

    id: id.trim(),
    studentId: studentId.trim(),

    borrowDate,
    returnDate:
      normalizedReturnDate,

    startTime,
    endTime,

    submittedAt,

    purpose:
      String(purpose ?? ""),

    status:
      String(status ?? "pending")
        .trim()
        .toLowerCase(),

    items:
      Object.freeze(
        normalizedItems
      ),

    startMinutes,
    endMinutes,
  });
}


/* ============================================================
   NORMALIZE EXISTING REQUEST
============================================================ */

function normalizeExistingRequest(
  request
) {
  return normalizeRequest(request);
}


/* ============================================================
   ENSURE NORMALIZED REQUEST
============================================================ */

/**
 * Important:
 *
 * Tests may directly call:
 *
 * checkTimeOverlap(baseRequest(), ...)
 *
 * while the main validator passes an already-normalized object.
 *
 * This helper supports BOTH.
 */

function ensureNormalizedRequest(
  request
) {
  if (
    request &&
    typeof request === "object" &&
    Array.isArray(request.items) &&
    typeof request.id === "string" &&
    typeof request.studentId === "string" &&
    typeof request.borrowDate === "string" &&
    Object.prototype.hasOwnProperty.call(
      request,
      "startMinutes"
    ) &&
    Object.prototype.hasOwnProperty.call(
      request,
      "endMinutes"
    )
  ) {
    return request;
  }

  return normalizeRequest(request);
}


/* ============================================================
   CONSTRAINT 1
   INVENTORY CAPACITY
============================================================ */

function checkInventoryCapacity(
  request,
  inventory = {}
) {
  const normalized =
    ensureNormalizedRequest(request);

  for (
    const item
    of normalized.items
  ) {

    const available =
      Number(
        inventory?.[item.itemId] ?? 0
      );

    if (
      !Number.isFinite(available) ||
      item.quantity > available
    ) {
      return {
        satisfied: false,

        constraint:
          "inventory_capacity",

        message:
          `Insufficient inventory for item '${item.itemId}'. ` +
          `Requested: ${item.quantity}, ` +
          `Available: ${Number.isFinite(available) ? available : 0}.`,
      };
    }
  }

  return {
    satisfied: true,

    constraint:
      "inventory_capacity",
  };
}


/* ============================================================
   CONSTRAINT 2
   TIME OVERLAP
============================================================ */

function checkTimeOverlap(
  request,
  existingRequests = []
) {
  const normalized =
    ensureNormalizedRequest(request);
  const usesTimeIntervals =
    normalized.startMinutes != null &&
    normalized.endMinutes != null;


  for (
    const existingRaw
    of existingRequests
  ) {

    if (!existingRaw) {
      continue;
    }

    let existing;

    try {
      existing =
        ensureNormalizedRequest(
          existingRaw
        );
    } catch {
      continue;
    }


    if (
      existing.id ===
      normalized.id
    ) {
      continue;
    }


    const existingStatus =
      String(
        existing.status ?? ""
      )
        .trim()
        .toLowerCase();


    if (
      existingStatus === "rejected" ||
      existingStatus === "cancelled" ||
      existingStatus === "returned"
    ) {
      continue;
    }


    const overlaps = usesTimeIntervals
      ? existing.borrowDate === normalized.borrowDate
        && existing.startMinutes != null
        && existing.endMinutes != null
        && intervalsOverlap(
          normalized.startMinutes,
          normalized.endMinutes,
          existing.startMinutes,
          existing.endMinutes
        )
      : normalized.borrowDate <= existing.returnDate
        && existing.borrowDate <= normalized.returnDate;


    if (!overlaps) {
      continue;
    }


    const requestItemIds =
      new Set(
        normalized.items.map(
          (item) =>
            item.itemId
        )
      );


    const existingItemIds =
      new Set(
        existing.items.map(
          (item) =>
            item.itemId
        )
      );


    const sharedItem =
      [...requestItemIds].some(
        (itemId) =>
          existingItemIds.has(
            itemId
          )
      );


    if (sharedItem) {
      return {
        satisfied: false,

        constraint:
          "time_overlap",

        message:
          `Time conflict detected with request '${existing.id}'.`,
      };
    }
  }


  return {
    satisfied: true,

    constraint:
      "time_overlap",
  };
}


/* ============================================================
   CANONICAL ITEM SIGNATURE
============================================================ */

function canonicalItemSignature(
  items
) {
  return JSON.stringify(
    [...items]
      .map((item) => ({
        itemId:
          String(item.itemId),

        quantity:
          Number(item.quantity),
      }))
      .sort((a, b) => {

        const idCompare =
          a.itemId.localeCompare(
            b.itemId
          );

        if (
          idCompare !== 0
        ) {
          return idCompare;
        }

        return (
          a.quantity -
          b.quantity
        );
      })
  );
}


/* ============================================================
   CONSTRAINT 3
   DUPLICATE REQUEST
============================================================ */

function checkDuplicateRequest(
  request,
  existingRequests = []
) {
  const normalized =
    ensureNormalizedRequest(request);

  const currentItemKey =
    canonicalItemSignature(
      normalized.items
    );

  const currentPurpose =
    String(
      normalized.purpose ?? ""
    )
      .trim()
      .toLowerCase();


  for (
    const existingRaw
    of existingRequests
  ) {

    if (!existingRaw) {
      continue;
    }

    let existing;

    try {
      existing =
        ensureNormalizedRequest(
          existingRaw
        );
    } catch {
      continue;
    }


    if (
      existing.id ===
      normalized.id
    ) {
      continue;
    }


    if (
      existing.studentId !==
      normalized.studentId
    ) {
      continue;
    }


    if (
      existing.borrowDate !==
      normalized.borrowDate
    ) {
      continue;
    }

    if (
      existing.returnDate !==
      normalized.returnDate
    ) {
      continue;
    }


    const existingStatus =
      String(
        existing.status ?? ""
      )
        .trim()
        .toLowerCase();


    if (
      existingStatus ===
        "rejected" ||
      existingStatus ===
        "cancelled"
    ) {
      continue;
    }


    const existingItemKey =
      canonicalItemSignature(
        existing.items
      );


    const existingPurpose =
      String(
        existing.purpose ?? ""
      )
        .trim()
        .toLowerCase();


    if (
      currentItemKey ===
        existingItemKey &&
      currentPurpose ===
        existingPurpose
    ) {
      return {
        satisfied: false,

        constraint:
          "duplicate_request",

        message:
          `Duplicate borrowing request detected. ` +
          `Existing request: '${existing.id}'.`,
      };
    }
  }


  return {
    satisfied: true,

    constraint:
      "duplicate_request",
  };
}


/* ============================================================
   CONSTRAINT 4
   BORROWING LIMIT
============================================================ */

function checkBorrowingLimit(
  request,
  policy = DEFAULT_POLICY
) {
  const normalized =
    ensureNormalizedRequest(request);

  const finalPolicy = {
    ...DEFAULT_POLICY,
    ...(policy || {}),
  };


  const totalQuantity =
    normalized.items.reduce(
      (total, item) =>
        total + item.quantity,
      0
    );


  if (
    totalQuantity >
    finalPolicy.maxQuantityPerStudent
  ) {
    return {
      satisfied: false,

      constraint:
        "borrowing_limit",

      message:
        `Borrowing limit exceeded. ` +
        `Maximum: ${finalPolicy.maxQuantityPerStudent}, ` +
        `Requested: ${totalQuantity}.`,
    };
  }


  if (
    normalized.items.length >
    finalPolicy.maxItemsPerRequest
  ) {
    return {
      satisfied: false,

      constraint:
        "borrowing_limit",

      message:
        `Maximum number of different items per request is ` +
        `${finalPolicy.maxItemsPerRequest}.`,
    };
  }


  return {
    satisfied: true,

    constraint:
      "borrowing_limit",
  };
}


/* ============================================================
   CONSTRAINT 5
   LEAD TIME
============================================================ */

function checkLeadTime(
  request,
  now = new Date(),
  policy = DEFAULT_POLICY
) {
  const normalized =
    ensureNormalizedRequest(request);

  const finalPolicy = {
    ...DEFAULT_POLICY,
    ...(policy || {}),
  };


  invariant(
    now instanceof Date &&
      !Number.isNaN(
        now.valueOf()
      ),
    "now must be a valid Date"
  );


  let submittedDateString;

  try {
    submittedDateString = dateInTimeZone(now, finalPolicy.timeZone);
  } catch {
    throw new TypeError(`Invalid policy timeZone: ${finalPolicy.timeZone}`);
  }


  const days =
    dateDifferenceInDays(
      submittedDateString,
      normalized.borrowDate
    );


  if (
    days <
    finalPolicy.leadTimeDays
  ) {
    return {
      satisfied: false,

      constraint:
        "lead_time",

      message:
        `Request must be submitted at least ` +
        `${finalPolicy.leadTimeDays} day(s) before the borrowing date.`,
    };
  }


  return {
    satisfied: true,

    constraint:
      "lead_time",
  };
}


/* ============================================================
   CONSTRAINT 6
   RETURN / OUTSTANDING
============================================================ */

function checkOutstandingBorrowing(
  request,
  existingRequests = [],
  policy = DEFAULT_POLICY
) {
  const normalized =
    ensureNormalizedRequest(request);

  const finalPolicy = {
    ...DEFAULT_POLICY,
    ...(policy || {}),
  };


  if (
    !finalPolicy.preventOutstandingBorrowing
  ) {
    return {
      satisfied: true,

      constraint:
        "return_outstanding",
    };
  }


  const activeStatuses =
    new Set([
      "approved",
      "borrowed",
      "active",
    ]);


  for (
    const existingRaw
    of existingRequests
  ) {

    if (!existingRaw) {
      continue;
    }

    let existing;

    try {
      existing =
        ensureNormalizedRequest(
          existingRaw
        );
    } catch {
      continue;
    }


    if (
      existing.id ===
      normalized.id
    ) {
      continue;
    }


    if (
      existing.studentId !==
      normalized.studentId
    ) {
      continue;
    }


    const existingStatus =
      String(
        existing.status ?? ""
      )
        .trim()
        .toLowerCase();


    if (
      !activeStatuses.has(
        existingStatus
      )
    ) {
      continue;
    }


    for (
      const newItem
      of normalized.items
    ) {

      const outstanding =
        existing.items.some(
          (oldItem) =>
            oldItem.itemId ===
            newItem.itemId
        );


      if (outstanding) {
        return {
          satisfied: false,

          constraint:
            "return_outstanding",

          message:
            `Student has an outstanding borrowing ` +
            `for item '${newItem.itemId}'.`,
        };
      }
    }
  }


  return {
    satisfied: true,

    constraint:
      "return_outstanding",
  };
}


/* ============================================================
   CONSTRAINT 7
   STATUS
============================================================ */

function checkStatus(
  request,
  existingRequests = []
) {
  const normalized =
    ensureNormalizedRequest(request);

  const activeStatuses =
    new Set([
      "pending",
      "validated",
      "approved",
      "borrowed",
      "active",
    ]);


  for (
    const existingRaw
    of existingRequests
  ) {

    if (!existingRaw) {
      continue;
    }

    let existing;

    try {
      existing =
        ensureNormalizedRequest(
          existingRaw
        );
    } catch {
      continue;
    }


    if (
      existing.id ===
      normalized.id
    ) {
      continue;
    }


    if (
      existing.studentId !==
      normalized.studentId
    ) {
      continue;
    }


    const existingStatus =
      String(
        existing.status ?? ""
      )
        .trim()
        .toLowerCase();


    if (
      !activeStatuses.has(
        existingStatus
      )
    ) {
      continue;
    }


    if (
      existing.borrowDate !==
      normalized.borrowDate
    ) {
      continue;
    }


    const existingItemIds =
      new Set(
        existing.items.map(
          (item) =>
            item.itemId
        )
      );


    const conflict =
      normalized.items.some(
        (item) =>
          existingItemIds.has(
            item.itemId
          )
      );


    if (conflict) {
      return {
        satisfied: false,

        constraint:
          "status",

        message:
          `Student already has an active request ` +
          `for the same item and borrowing date ` +
          `(request '${existing.id}').`,
      };
    }
  }


  return {
    satisfied: true,

    constraint:
      "status",
  };
}


/* ============================================================
   CONSTRAINT 8
   AVAILABILITY DATE
============================================================ */

function checkAvailabilityDate(
  request,
  inventoryAvailability = {}
) {
  const normalized =
    ensureNormalizedRequest(request);


  for (
    const item
    of normalized.items
  ) {

    const availabilityRules =
      inventoryAvailability?.[
        item.itemId
      ];


    /*
     * No date restriction means
     * the item is considered available.
     */

    if (
      !Array.isArray(
        availabilityRules
      )
    ) {
      continue;
    }

    const blockedPeriods = availabilityRules.filter(
      (rule) => rule && typeof rule === "object" && !Array.isArray(rule)
    );

    const blockedPeriod = blockedPeriods.find((rule) => {
      const startDate = rule.startDate ?? rule.start_date;
      const endDate = rule.endDate ?? rule.end_date;
      return isValidDate(startDate)
        && isValidDate(endDate)
        && normalized.borrowDate <= endDate
        && startDate <= normalized.returnDate;
    });

    if (blockedPeriod) {
      const reason = String(blockedPeriod.reason ?? "").trim();
      return {
        satisfied: false,
        constraint: "availability_date",
        message: `Item '${item.itemId}' is unavailable during the requested dates${reason ? `: ${reason}` : "."}`,
      };
    }

    const availableDates = availabilityRules.filter((rule) => typeof rule === "string");

    if (
      blockedPeriods.length === 0 &&
      !availableDates.includes(
        normalized.borrowDate
      )
    ) {
      return {
        satisfied: false,

        constraint:
          "availability_date",

        message:
          `Item '${item.itemId}' is not available ` +
          `on ${normalized.borrowDate}.`,
      };
    }
  }


  return {
    satisfied: true,

    constraint:
      "availability_date",
  };
}


/* ============================================================
   CSP VALIDATION
============================================================ */

function validateBorrowingRequest({
  request,
  existingRequests = [],
  inventory = {},
  inventoryAvailability = {},
  policy = {},
  now = new Date(),
}) {

  /* ----------------------------------------------------------
     NORMALIZE NEW REQUEST
  ---------------------------------------------------------- */

  const normalized =
    normalizeRequest(request);


  /* ----------------------------------------------------------
     NORMALIZE EXISTING REQUESTS
  ---------------------------------------------------------- */

  const normalizedExistingRequests =
    existingRequests
      .map((existing) => {

        if (!existing) {
          return null;
        }

        try {
          return normalizeExistingRequest(
            existing
          );
        } catch {
          return null;
        }
      })
      .filter(Boolean);


  /* ----------------------------------------------------------
     FINAL POLICY
  ---------------------------------------------------------- */

  const finalPolicy = {
    ...DEFAULT_POLICY,
    ...(policy || {}),
  };


  /* ----------------------------------------------------------
     VIOLATIONS
  ---------------------------------------------------------- */

  const violations = [];


  /* ----------------------------------------------------------
     RUN ALL EIGHT CONSTRAINTS
  ---------------------------------------------------------- */

  const checks = [

    /* 1. Inventory Capacity */
    checkInventoryCapacity(
      normalized,
      inventory
    ),


    /* 2. Time Overlap */
    checkTimeOverlap(
      normalized,
      normalizedExistingRequests
    ),


    /* 3. Duplicate Request */
    checkDuplicateRequest(
      normalized,
      normalizedExistingRequests
    ),


    /* 4. Borrowing Limit */
    checkBorrowingLimit(
      normalized,
      finalPolicy
    ),


    /* 5. Lead Time */
    checkLeadTime(
      normalized,
      now,
      finalPolicy
    ),


    /* 6. Return / Outstanding */
    checkOutstandingBorrowing(
      normalized,
      normalizedExistingRequests,
      finalPolicy
    ),


    /* 7. Status */
    checkStatus(
      normalized,
      normalizedExistingRequests
    ),


    /* 8. Availability Date */
    checkAvailabilityDate(
      normalized,
      inventoryAvailability
    ),
  ];


  /* ----------------------------------------------------------
     COLLECT VIOLATIONS
  ---------------------------------------------------------- */

  for (
    const result
    of checks
  ) {

    if (
      !result.satisfied
    ) {
      violations.push(
        result
      );
    }
  }


  /* ----------------------------------------------------------
     RESULT
  ---------------------------------------------------------- */

  return Object.freeze({

    valid:
      violations.length === 0,

    requestId:
      normalized.id,

    violations:
      Object.freeze(
        violations
      ),

    checkedConstraints:
      Object.freeze([
        "inventory_capacity",
        "time_overlap",
        "duplicate_request",
        "borrowing_limit",
        "lead_time",
        "return_outstanding",
        "status",
        "availability_date",
      ]),
  });
}


/* ============================================================
   EXPORTS
============================================================ */

module.exports = {

  DEFAULT_POLICY,

  /* Constraints */
  checkInventoryCapacity,
  checkTimeOverlap,
  checkDuplicateRequest,
  checkBorrowingLimit,
  checkLeadTime,
  checkOutstandingBorrowing,
  checkStatus,
  checkAvailabilityDate,

  /* Helpers */
  intervalsOverlap,
  isValidDate,
  parseTime,

  /* Normalization */
  normalizeRequest,
  normalizeExistingRequest,

  /* Main CSP */
  validateBorrowingRequest,
};
