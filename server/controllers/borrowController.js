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
const { writeAuditLog } = require("../utils/auditLog");
const { notifyRoles, notifyUser } = require("../utils/notifications");

const RESERVED_STATUSES = new Set(["Pending", "Validated", "Approved"]);
const BORROWED_STATUSES = new Set(["Borrowed"]);
const STATUS_TRANSITIONS = Object.freeze({
  Pending: new Set(["Approved", "Rejected"]),
  Validated: new Set(["Approved", "Rejected"]),
  Approved: new Set(["Borrowed", "Rejected"]),
  Borrowed: new Set(),
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

    if (
      typeof value === "string" &&
      /^\d+$/.test(value.trim())
    ) {
      return Number(value.trim());
    }

    return Number.NaN;
  };

  return {
    studentName:
      source.studentName ??
      source.student_name,

    studentId:
      source.studentId ??
      source.student_id,

    laboratoryNumber:
      source.laboratoryNumber ??
      source.laboratory_number,

    borrowDate:
      source.borrowDate ??
      source.borrow_date,

    returnDate:
      source.returnDate ??
      source.return_date,

    purpose:
      source.purpose,

    items:
      Array.isArray(source.items)
        ? source.items.map((item) => ({
            inventoryId:
              item?.inventoryId ??
              item?.inventory_id,

            quantity:
              normalizeQuantity(
                item?.quantity
              ),
          }))
        : [],
  };
}

function serializeBorrowRequest(request) {
  return {
    id: request.id,
    studentName: request.student_name,
    studentId: request.student_id,
    laboratoryNumber: request.laboratory_number,
    borrowDate: request.borrow_date,
    returnDate: request.return_date,
    purpose: request.purpose,
    status: String(request.status ?? "").toLowerCase(),
    requestedAt: request.created_at,
    actualReturnedAt: request.actual_returned_at ?? null,
    overdue: Boolean(request.overdue),
    items: Array.isArray(request.items) ? request.items : [],
  };
}

function normalizeReturn(body) {
  const source = body && typeof body === "object" ? body : {};
  const integer = (value) => typeof value === "number" && Number.isInteger(value) ? value
    : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : Number.NaN;
  return {
    remarks: typeof source.remarks === "string" ? source.remarks.trim() : "",
    items: Array.isArray(source.items) ? source.items.map((item) => ({
      inventoryId: item?.inventoryId ?? item?.inventory_id,
      goodQuantity: integer(item?.goodQuantity ?? item?.good_quantity ?? 0),
      damagedQuantity: integer(item?.damagedQuantity ?? item?.damaged_quantity ?? 0),
      missingQuantity: integer(item?.missingQuantity ?? item?.missing_quantity ?? 0),
      conditionNote: typeof (item?.conditionNote ?? item?.condition_note) === "string"
        ? (item.conditionNote ?? item.condition_note).trim() : "",
    })) : [],
  };
}

function returnErrors(returnData) {
  const errors = [];
  if (returnData.remarks.length > 1000) errors.push("Return remarks cannot exceed 1000 characters.");
  if (!returnData.items.length) errors.push("At least one returned item is required.");
  const ids = new Set();
  let total = 0;
  for (const item of returnData.items) {
    const id = String(item.inventoryId ?? "").trim();
    if (!/^\d+$/.test(id)) errors.push("Every returned item must have a valid inventory ID.");
    if (ids.has(id)) errors.push(`Inventory item '${id}' appears more than once.`);
    ids.add(id);
    for (const [label, quantity] of [["good", item.goodQuantity], ["damaged", item.damagedQuantity], ["missing", item.missingQuantity]]) {
      if (!Number.isSafeInteger(quantity) || quantity < 0) errors.push(`${label} quantity for item '${id}' must be a non-negative whole number.`);
    }
    if (item.conditionNote.length > 500) errors.push(`Condition note for item '${id}' cannot exceed 500 characters.`);
    total += item.goodQuantity + item.damagedQuantity + item.missingQuantity;
  }
  if (returnData.items.length && total <= 0) errors.push("At least one unit must be accounted for.");
  return errors;
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
  if (inventoryIds.length === 0) return {
    inventory: [], existingBorrowings: [], existingRequests: [], inventoryAvailability: {},
  };

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

  const unavailabilityResult = await client.query(
    `SELECT inventory_id, start_date::text AS start_date, end_date::text AS end_date, reason
       FROM public.inventory_unavailability
      WHERE inventory_id::text = ANY($1::text[])
        AND start_date <= $2::date
        AND end_date >= $3::date
      ORDER BY inventory_id, start_date, end_date`,
    [inventoryIds, request.returnDate, request.borrowDate]
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

  const inventoryAvailability = {};
  for (const row of unavailabilityResult.rows) {
    const inventoryId = String(row.inventory_id);
    inventoryAvailability[inventoryId] ||= [];
    inventoryAvailability[inventoryId].push({
      startDate: String(row.start_date).slice(0, 10),
      endDate: String(row.end_date).slice(0, 10),
      reason: row.reason,
    });
  }

  return {
    inventory: inventoryResult.rows,
    existingBorrowings: reservationsResult.rows.map((row) => ({
      inventoryId: row.inventory_id,
      quantity: row.has_invalid_quantity ? Number.NaN : Number(row.quantity),
    })),
    existingRequests: [...requestsById.values()],
    inventoryAvailability,
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
      inventoryAvailability: validationOptions.inventoryAvailability ?? context.inventoryAvailability,
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
      `INSERT INTO borrow_requests
        (
          student_name,
          student_id,
          laboratory_number,
          borrow_date,
          return_date,
          purpose,
          status,
          user_id
        )
      VALUES
        (
          $1,
          $2,
          $3,
          $4::date,
          $5::date,
          $6,
          $7,
          $8
        )
      RETURNING *`,
      [
        request.studentName.trim(),
        request.studentId.trim(),
        request.laboratoryNumber?.trim() || null,
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

    await writeAuditLog(client, validationOptions.actor, {
      action: "borrowing_submitted",
      entityType: "borrowing_request",
      entityId: savedRequest.id,
      newValues: { ...savedRequest, items: request.items },
    });
    await notifyRoles(client, ["professor", "admin"], {
      type: "borrowing_submitted",
      title: "New borrowing request",
      message: `${savedRequest.student_name} submitted a borrowing request for ${savedRequest.borrow_date}.`,
      relatedPath: "/admin/requests",
      entityType: "borrowing_request",
      entityId: savedRequest.id,
    });

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
      { userId: req.user.id, actor: req.user }
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
              br.return_date, br.actual_returned_at, br.purpose, br.status, br.created_at,
              (br.status = 'Borrowed' AND br.return_date < (now() AT TIME ZONE 'Asia/Manila')::date) AS overdue,
              COALESCE(
                json_agg(json_build_object(
                  'name', inventory.item_name,
                  'inventoryId', bri.inventory_id,
                  'quantity', bri.quantity,
                  'goodQuantity', COALESCE(returned.good_quantity, 0),
                  'damagedQuantity', COALESCE(returned.damaged_quantity, 0),
                  'missingQuantity', COALESCE(returned.missing_quantity, 0),
                  'accountedQuantity', COALESCE(returned.accounted_quantity, 0),
                  'outstandingQuantity', GREATEST(0, bri.quantity - COALESCE(returned.accounted_quantity, 0))
                ) ORDER BY bri.inventory_id) FILTER (WHERE bri.inventory_id IS NOT NULL),
                '[]'::json
              ) AS items
         FROM borrow_requests br
         LEFT JOIN borrow_request_items bri ON bri.request_id = br.id
         LEFT JOIN inventory ON inventory.id = bri.inventory_id
         LEFT JOIN (
           SELECT request_id, inventory_id,
                  SUM(good_quantity)::integer AS good_quantity,
                  SUM(damaged_quantity)::integer AS damaged_quantity,
                  SUM(missing_quantity)::integer AS missing_quantity,
                  SUM(good_quantity + damaged_quantity + missing_quantity)::integer AS accounted_quantity
             FROM borrowing_return_items GROUP BY request_id, inventory_id
         ) returned ON returned.request_id = br.id AND returned.inventory_id = bri.inventory_id
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

async function processBorrowingReturn(req, res, next) {
  const requestId = req.params.id;
  if (!/^[1-9]\d*$/.test(String(requestId ?? ""))) {
    return res.status(400).json({ error: "INVALID_REQUEST_ID", message: "Borrowing request ID is invalid." });
  }
  const returnData = normalizeReturn(req.body);
  const errors = returnErrors(returnData);
  if (errors.length) return res.status(422).json({ error: "INVALID_RETURN", reasons: errors });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const requestResult = await client.query(`SELECT * FROM borrow_requests WHERE id = $1 FOR UPDATE`, [requestId]);
    if (!requestResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "REQUEST_NOT_FOUND", message: "Borrowing request was not found." });
    }
    const request = requestResult.rows[0];
    if (request.status !== "Borrowed") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "REQUEST_NOT_BORROWED", message: "Only borrowed requests can be returned." });
    }

    const requestedResult = await client.query(
      `SELECT inventory_id, quantity FROM borrow_request_items WHERE request_id = $1 ORDER BY inventory_id FOR UPDATE`, [requestId]
    );
    const totalsResult = await client.query(
      `SELECT inventory_id, SUM(good_quantity + damaged_quantity + missing_quantity)::integer AS accounted
         FROM borrowing_return_items WHERE request_id = $1 GROUP BY inventory_id`, [requestId]
    );
    const requested = new Map(requestedResult.rows.map((item) => [String(item.inventory_id), Number(item.quantity)]));
    const previous = new Map(totalsResult.rows.map((item) => [String(item.inventory_id), Number(item.accounted)]));
    const submittedItems = returnData.items.filter((item) => item.goodQuantity + item.damagedQuantity + item.missingQuantity > 0);
    for (const item of submittedItems) {
      const id = String(item.inventoryId);
      if (!requested.has(id)) {
        await client.query("ROLLBACK");
        return res.status(422).json({ error: "RETURN_ITEM_NOT_REQUESTED", message: `Inventory item '${id}' is not part of this request.` });
      }
      const accounted = item.goodQuantity + item.damagedQuantity + item.missingQuantity;
      const outstanding = requested.get(id) - (previous.get(id) ?? 0);
      if (accounted > outstanding) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "RETURN_QUANTITY_EXCEEDED", message: `Only ${outstanding} unit(s) remain outstanding for inventory item '${id}'.` });
      }
    }

    const returnResult = await client.query(
      `INSERT INTO borrowing_returns (request_id, processed_by, remarks) VALUES ($1, $2, $3) RETURNING *`,
      [requestId, req.user.id, returnData.remarks || null]
    );
    for (const item of submittedItems) {
      const accounted = item.goodQuantity + item.damagedQuantity + item.missingQuantity;
      await client.query(
        `INSERT INTO borrowing_return_items
          (return_id, request_id, inventory_id, good_quantity, damaged_quantity, missing_quantity, condition_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [returnResult.rows[0].id, requestId, item.inventoryId, item.goodQuantity, item.damagedQuantity, item.missingQuantity, item.conditionNote || null]
      );
      const inventoryResult = await client.query(
        `UPDATE inventory SET borrowed_quantity = borrowed_quantity - $1,
            breakage = COALESCE(breakage, 0) + $2, missing = COALESCE(missing, 0) + $3, updated_at = now()
          WHERE id = $4 AND borrowed_quantity >= $1 RETURNING id`,
        [accounted, item.damagedQuantity, item.missingQuantity, item.inventoryId]
      );
      if (!inventoryResult.rowCount) throw new Error(`Inventory counters are inconsistent for item '${item.inventoryId}'.`);
      previous.set(String(item.inventoryId), (previous.get(String(item.inventoryId)) ?? 0) + accounted);
    }

    const complete = requestedResult.rows.every((item) => (previous.get(String(item.inventory_id)) ?? 0) === Number(item.quantity));
    const updatedResult = await client.query(
      `UPDATE borrow_requests SET status = CASE WHEN $2 THEN 'Returned' ELSE status END,
          actual_returned_at = CASE WHEN $2 THEN now() ELSE actual_returned_at END,
          overdue_resolved_at = CASE WHEN $2 AND overdue_detected_at IS NOT NULL THEN now() ELSE overdue_resolved_at END,
          updated_at = now()
        WHERE id = $1 RETURNING *`, [requestId, complete]
    );
    if (complete) await client.query(`DELETE FROM calendar_events WHERE borrow_request_id = $1`, [requestId]);

    await writeAuditLog(client, req.user, {
      action: "borrowing_return_processed", entityType: "borrowing_request", entityId: requestId,
      oldValues: { status: request.status },
      newValues: { status: updatedResult.rows[0].status, complete, returnId: returnResult.rows[0].id, items: submittedItems, remarks: returnData.remarks },
    });
    await notifyUser(client, request.user_id, {
      type: complete ? "borrowing_returned" : "borrowing_partial_return",
      title: complete ? "Borrowing return completed" : "Partial return recorded",
      message: complete ? `All items for BR-${String(requestId).padStart(3, "0")} have been accounted for.`
        : `A partial return was recorded for BR-${String(requestId).padStart(3, "0")}. Outstanding items remain.`,
      relatedPath: "/my-requests", entityType: "borrowing_request", entityId: requestId,
    });
    await client.query("COMMIT");
    return res.status(201).json({ return: returnResult.rows[0], request: updatedResult.rows[0], complete });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

async function createBorrowRequest(req, res, next) {
  try {
    const result = await withValidation(
      authenticatedStudentRequest(req.body, req.user),
      true,
      pool,
      { userId: req.user.id, actor: req.user }
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

    await writeAuditLog(client, req.user, {
      action: "borrowing_status_changed",
      entityType: "borrowing_request",
      entityId: requestId,
      oldValues: { status: request.status },
      newValues: { status: nextStatus },
    });
    await notifyUser(client, request.user_id, {
      type: `borrowing_${String(nextStatus).toLowerCase()}`,
      title: `Borrowing request ${String(nextStatus).toLowerCase()}`,
      message: `Your borrowing request BR-${String(requestId).padStart(3, "0")} is now ${String(nextStatus).toLowerCase()}.`,
      relatedPath: "/my-requests",
      entityType: "borrowing_request",
      entityId: requestId,
    });

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
  normalizeReturn,
  processBorrowingReturn,
  returnErrors,
  serializeBorrowRequest,
  validatePolicyConstraints,
  updateBorrowRequestStatus,
  validateBorrowRequest,
  withValidation,
};
