"use strict";

const pool = require("../config/db");
const {
  availableQuantity,
  validateBorrowingRequest,
  validateBorrowingRequestShape,
} = require("../algorithms/borrowingValidation");
const { validateBorrowingRequest: validateBorrowingPolicy } = require("../algorithms/csp");
const {
  ACTIVE_BORROWING_STATUSES,
  detectBorrowingConflicts,
} = require("../algorithms/conflictDetection");

const RESERVED_STATUSES = new Set(["Pending", "Validated", "Approved"]);
const BORROWED_STATUSES = new Set(["Borrowed"]);
const STATUS_TRANSITIONS = Object.freeze({
  Pending: new Set(["Approved", "Rejected"]),
  Validated: new Set(["Approved", "Rejected"]),
  Approved: new Set(["Borrowed", "Returned", "Rejected"]),
  Borrowed: new Set(["Returned"]),
  Rejected: new Set(),
  Returned: new Set(),
});

function inventoryDeltas(previousStatus, nextStatus, quantity) {
  return {
    reserved: (RESERVED_STATUSES.has(nextStatus) ? quantity : 0)
      - (RESERVED_STATUSES.has(previousStatus) ? quantity : 0),
    borrowed: (BORROWED_STATUSES.has(nextStatus) ? quantity : 0)
      - (BORROWED_STATUSES.has(previousStatus) ? quantity : 0),
  };
}

function normalizeRequest(body) {
  const source = body && typeof body === "object" ? body : {};
  const normalizeQuantity = (value) => {
    if (typeof value === "number") return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
    return Number.NaN;
  };

  return {
    studentName: source.studentName ?? source.student_name,
    studentId: source.studentId ?? source.student_id,
    borrowDate: source.borrowDate ?? source.borrow_date,
    returnDate: source.returnDate ?? source.return_date,
    purpose: source.purpose,
    items: Array.isArray(source.items) ? source.items.map((item) => ({
      inventoryId: item?.inventoryId ?? item?.inventory_id,
      quantity: normalizeQuantity(item?.quantity),
    })) : [],
  };
}

function serializeBorrowRequest(request) {
  return {
    id: request.id,
    studentName: request.student_name,
    studentId: request.student_id,
    borrowDate: request.borrow_date,
    returnDate: request.return_date,
    purpose: request.purpose,
    status: String(request.status ?? "").toLowerCase(),
    requestedAt: request.created_at,
    items: Array.isArray(request.items) ? request.items : [],
  };
}

function authenticatedStudentRequest(body, user) {
  return {
    ...(body && typeof body === "object" ? body : {}),
    studentName: user.full_name,
    studentId: user.student_id,
  };
}

const POLICY_REASON_CODES = Object.freeze({
  inventory_capacity: "INSUFFICIENT_INVENTORY",
  time_overlap: "TIME_OVERLAP",
  duplicate_request: "DUPLICATE_BORROWING_REQUEST",
  borrowing_limit: "BORROWING_LIMIT_EXCEEDED",
  lead_time: "LEAD_TIME_NOT_MET",
  return_outstanding: "OUTSTANDING_BORROWING",
  status: "ACTIVE_REQUEST_CONFLICT",
  availability_date: "INVENTORY_DATE_UNAVAILABLE",
});

function validatePolicyConstraints({
  request,
  inventory = [],
  existingBorrowings = [],
  existingRequests = [],
  inventoryAvailability = {},
  policy = {},
  now = new Date(),
}) {
  const reservedByInventoryId = new Map(existingBorrowings.map((entry) => [
    String(entry.inventoryId),
    Number(entry.quantity),
  ]));
  const inventoryCapacity = Object.fromEntries(inventory.map((item) => {
    const inventoryId = String(item.id);
    const remaining = availableQuantity(item) - (reservedByInventoryId.get(inventoryId) ?? 0);
    return [inventoryId, remaining];
  }));
  const policyRequest = {
    id: "new-borrowing-request",
    studentId: request.studentId.trim().toLowerCase(),
    borrowDate: request.borrowDate,
    returnDate: request.returnDate,
    purpose: request.purpose,
    status: "pending",
    items: request.items.map((item) => ({
      itemId: String(item.inventoryId),
      quantity: item.quantity,
    })),
  };
  const policyExistingRequests = existingRequests.map((existing) => ({
    id: String(existing.id),
    studentId: String(existing.studentId).trim().toLowerCase(),
    borrowDate: existing.borrowDate,
    returnDate: existing.returnDate,
    purpose: existing.purpose,
    status: existing.status,
    items: existing.items.map((item) => ({
      itemId: String(item.inventoryId),
      quantity: Number(item.quantity),
    })),
  }));
  const result = validateBorrowingPolicy({
    request: policyRequest,
    existingRequests: policyExistingRequests,
    inventory: inventoryCapacity,
    inventoryAvailability,
    policy,
    now,
  });

  return Object.freeze({
    valid: result.valid,
    checkedConstraints: result.checkedConstraints,
    reasons: Object.freeze(result.violations.map((violation) => ({
      code: POLICY_REASON_CODES[violation.constraint] ?? "BORROWING_POLICY_VIOLATION",
      constraint: violation.constraint,
      message: violation.message,
    }))),
  });
}

async function loadValidationContext(client, request) {
  const inventoryIds = [...new Set(request.items.map((item) => String(item.inventoryId)).filter(Boolean))];
  if (inventoryIds.length === 0) return { inventory: [], existingBorrowings: [], existingRequests: [] };

  // Inventory locks serialize capacity checks. The student-scoped advisory
  // lock additionally serializes disjoint-item requests by the same borrower,
  // preventing simultaneous duplicate or schedule-conflicting inserts.
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [request.studentId.trim().toLowerCase()]
  );

  const inventoryResult = await client.query(
    `SELECT id, item_name, quantity, additional_qty, replaces, missing,
            breakage, defective, total_loss
      FROM inventory
      WHERE id::text = ANY($1::text[])
      ORDER BY id
      FOR UPDATE`,
    [inventoryIds]
  );

  const reservationsResult = await client.query(
    `SELECT bri.inventory_id,
            COALESCE(SUM(bri.quantity), 0)::bigint AS quantity,
            count(*) FILTER (WHERE bri.quantity IS NULL OR bri.quantity <= 0) > 0 AS has_invalid_quantity
       FROM borrow_request_items bri
       JOIN borrow_requests br ON br.id = bri.request_id
      WHERE bri.inventory_id::text = ANY($1::text[])
        AND br.status = ANY($2::text[])
        AND br.borrow_date <= $3::date
        AND br.return_date >= $4::date
      GROUP BY bri.inventory_id`,
    [inventoryIds, ACTIVE_BORROWING_STATUSES, request.returnDate, request.borrowDate]
  );

  const conflictsResult = await client.query(
    `SELECT br.id, br.student_id, br.borrow_date, br.return_date, br.purpose, br.status,
            bri.inventory_id, bri.quantity
       FROM borrow_requests br
       LEFT JOIN borrow_request_items bri ON bri.request_id = br.id
      WHERE lower(trim(br.student_id)) = $1
        AND br.status = ANY($2::text[])
      ORDER BY br.id, bri.inventory_id`,
    [request.studentId.trim().toLowerCase(), ACTIVE_BORROWING_STATUSES]
  );

  const requestsById = new Map();
  for (const row of conflictsResult.rows) {
    if (!requestsById.has(String(row.id))) {
      requestsById.set(String(row.id), {
        id: row.id,
        studentId: row.student_id,
        borrowDate: row.borrow_date,
        returnDate: row.return_date,
        purpose: row.purpose,
        status: row.status,
        items: [],
      });
    }
    if (row.inventory_id != null) {
      requestsById.get(String(row.id)).items.push({
        inventoryId: row.inventory_id,
        quantity: Number(row.quantity),
      });
    }
  }

  return {
    inventory: inventoryResult.rows,
    existingBorrowings: reservationsResult.rows.map((row) => ({
      inventoryId: row.inventory_id,
      quantity: row.has_invalid_quantity ? Number.NaN : Number(row.quantity),
    })),
    existingRequests: [...requestsById.values()],
  };
}

async function withValidation(body, persist, databasePool = pool, validationOptions = {}) {
  const request = normalizeRequest(body);
  const shapeErrors = validateBorrowingRequestShape(request);
  if (shapeErrors.length > 0) {
    return {
      request,
      validation: {
        valid: false,
        status: "Rejected",
        reasons: shapeErrors,
        assignment: null,
        checkedConstraints: [],
      },
    };
  }

  const client = await databasePool.connect();

  try {
    await client.query("BEGIN");
    const context = await loadValidationContext(client, request);
    const cspValidation = validateBorrowingRequest({ request, ...context });
    const policyValidation = validatePolicyConstraints({
      request,
      ...context,
      inventoryAvailability: validationOptions.inventoryAvailability,
      policy: validationOptions.policy,
      now: validationOptions.now,
    });
    const conflicts = detectBorrowingConflicts({
      request,
      existingRequests: context.existingRequests,
      validation: cspValidation,
    });
    const newConflictReasons = conflicts.filter((conflict) =>
      !cspValidation.reasons.some((reason) => reason.code === conflict.code
        && reason.inventoryId === conflict.inventoryId)
    );
    const newPolicyReasons = policyValidation.reasons.filter((policyReason) =>
      !cspValidation.reasons.some((reason) => reason.code === policyReason.code)
      && !newConflictReasons.some((reason) => reason.code === policyReason.code)
    );
    const valid = cspValidation.valid && policyValidation.valid && conflicts.length === 0;
    const validation = Object.freeze({
      ...cspValidation,
      valid,
      status: valid ? "Validated" : "Rejected",
      reasons: Object.freeze([
        ...cspValidation.reasons,
        ...newConflictReasons,
        ...newPolicyReasons,
      ]),
      assignment: valid ? cspValidation.assignment : null,
      checkedConstraints: Object.freeze([
        ...new Set([...cspValidation.checkedConstraints, ...policyValidation.checkedConstraints]),
      ]),
      conflicts,
    });

    if (!validation.valid || !persist) {
      await client.query("ROLLBACK");
      return { request, validation };
    }

    const requestResult = await client.query(
      `INSERT INTO borrow_requests (student_name, student_id, borrow_date, return_date, purpose, status, user_id)
       VALUES ($1, $2, $3::date, $4::date, $5, $6, $7)
       RETURNING *`,
      [
        request.studentName.trim(),
        request.studentId.trim(),
        request.borrowDate,
        request.returnDate,
        request.purpose.trim(),
        "Pending",
        validationOptions.userId ?? null,
      ]
    );
    const savedRequest = requestResult.rows[0];

    for (const item of request.items) {
      await client.query(
        `INSERT INTO borrow_request_items (request_id, inventory_id, quantity)
         VALUES ($1, $2, $3)`,
        [savedRequest.id, item.inventoryId, item.quantity]
      );

      await client.query(
        `UPDATE inventory
            SET reserved_quantity = reserved_quantity + $1,
                updated_at = now()
          WHERE id = $2`,
        [item.quantity, item.inventoryId]
      );
    }

    await client.query("COMMIT");
    return { request: savedRequest, validation };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function validateBorrowRequest(req, res, next) {
  try {
    const result = await withValidation(
      authenticatedStudentRequest(req.body, req.user),
      false,
      pool,
      { userId: req.user.id }
    );
    return res.status(result.validation.valid ? 200 : 422).json(result);
  } catch (error) {
    return next(error);
  }
}

async function listBorrowRequests(req, res, next) {
  try {
    const studentOnly = req.user.role === "student";
    const result = await pool.query(
      `SELECT br.id, br.student_name, br.student_id, br.borrow_date,
              br.return_date, br.purpose, br.status, br.created_at,
              COALESCE(
                json_agg(json_build_object(
                  'name', inventory.item_name,
                  'quantity', bri.quantity
                ) ORDER BY bri.inventory_id) FILTER (WHERE bri.inventory_id IS NOT NULL),
                '[]'::json
              ) AS items
         FROM borrow_requests br
         LEFT JOIN borrow_request_items bri ON bri.request_id = br.id
         LEFT JOIN inventory ON inventory.id = bri.inventory_id
        WHERE ($1::boolean = false OR br.user_id = $2::uuid)
        GROUP BY br.id
        ORDER BY br.created_at DESC, br.id DESC`,
      [studentOnly, req.user.id]
    );

    return res.json({ requests: result.rows.map(serializeBorrowRequest) });
  } catch (error) {
    return next(error);
  }
}

async function createBorrowRequest(req, res, next) {
  try {
    const result = await withValidation(
      authenticatedStudentRequest(req.body, req.user),
      true,
      pool,
      { userId: req.user.id }
    );
    return res.status(result.validation.valid ? 201 : 422).json(result);
  } catch (error) {
    return next(error);
  }
}

async function updateBorrowRequestStatus(req, res, next) {
  const requestId = req.params.id;
  const nextStatus = req.body?.status;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const requestResult = await client.query(
      `SELECT * FROM borrow_requests WHERE id = $1 FOR UPDATE`,
      [requestId]
    );
    if (requestResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "REQUEST_NOT_FOUND", message: "Borrowing request was not found." });
    }

    const request = requestResult.rows[0];
    const allowed = STATUS_TRANSITIONS[request.status];
    if (!allowed || !allowed.has(nextStatus)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "INVALID_STATUS_TRANSITION",
        message: `Cannot change a borrowing request from '${request.status}' to '${nextStatus}'.`,
      });
    }

    const itemsResult = await client.query(
      `SELECT inventory_id, quantity
         FROM borrow_request_items
        WHERE request_id = $1
        ORDER BY inventory_id
        FOR UPDATE`,
      [requestId]
    );

    for (const item of itemsResult.rows) {
      await client.query(`SELECT id FROM inventory WHERE id = $1 FOR UPDATE`, [item.inventory_id]);
      const delta = inventoryDeltas(request.status, nextStatus, Number(item.quantity));
      const inventoryResult = await client.query(
        `UPDATE inventory
            SET reserved_quantity = reserved_quantity + $1,
                borrowed_quantity = borrowed_quantity + $2,
                updated_at = now()
          WHERE id = $3
            AND reserved_quantity + $1 >= 0
            AND borrowed_quantity + $2 >= 0
        RETURNING id`,
        [delta.reserved, delta.borrowed, item.inventory_id]
      );
      if (inventoryResult.rowCount === 0) {
        throw new Error(`Inventory counters are inconsistent for item '${item.inventory_id}'.`);
      }
    }

    const updatedResult = await client.query(
      `UPDATE borrow_requests
          SET status = $1, updated_at = now()
        WHERE id = $2
      RETURNING *`,
      [nextStatus, requestId]
    );

    if (nextStatus === "Approved") {
      await client.query(
        `INSERT INTO calendar_events
          (title, event_date, event_type, description, borrow_request_id)
         VALUES ($1, $2, 'borrowing', $3, $4)
         ON CONFLICT (borrow_request_id) WHERE borrow_request_id IS NOT NULL
         DO UPDATE SET title = excluded.title,
                       event_date = excluded.event_date,
                       description = excluded.description,
                       updated_at = now()`,
        [
          `Borrowing: ${request.student_name}`,
          request.borrow_date,
          `${request.purpose || "Equipment borrowing"} (Return: ${request.return_date.toISOString?.().slice(0, 10) || request.return_date})`,
          requestId,
        ]
      );
    }

    if (nextStatus === "Rejected") {
      await client.query(`DELETE FROM calendar_events WHERE borrow_request_id = $1`, [requestId]);
    }

    await client.query("COMMIT");
    return res.json({ request: updatedResult.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  authenticatedStudentRequest,
  createBorrowRequest,
  inventoryDeltas,
  listBorrowRequests,
  loadValidationContext,
  normalizeRequest,
  serializeBorrowRequest,
  validatePolicyConstraints,
  updateBorrowRequestStatus,
  validateBorrowRequest,
  withValidation,
};
