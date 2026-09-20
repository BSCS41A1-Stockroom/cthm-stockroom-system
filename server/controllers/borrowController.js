"use strict";

const pool = require("../config/db");
const {
  availableQuantity,
  validateBorrowingRequest,
  validateBorrowingRequestShape,
} = require("../algorithms/borrowingValidation");
const {
  DEFAULT_POLICY,
  validateBorrowingRequest: validateBorrowingPolicy,
} = require("../algorithms/csp");
const {
  ACTIVE_BORROWING_STATUSES,
  detectBorrowingConflicts,
} = require("../algorithms/conflictDetection");
const { writeAuditLog } = require("../utils/auditLog");
const { notifyRoles, notifyUser } = require("../utils/notifications");
const { loadInventoryCommitment, usableInventoryQuantity } = require("../utils/inventoryCommitments");
const { parseAssetQr, verifyClaimTicket } = require("../utils/qrCredential");
const { processExpiredRequests } = require("./overdueController");
const { createTransactionReceipt } = require("../utils/transactionReceipt");

const RESERVED_STATUSES = new Set(["Pending", "Validated", "Approved"]);
const BORROWED_STATUSES = new Set(["Borrowed"]);
const STATUS_TRANSITIONS = Object.freeze({
  Pending: new Set(["Rejected"]),
  Validated: new Set(["Approved", "Rejected"]),
  Approved: new Set(["Borrowed", "Rejected"]),
  Borrowed: new Set(),
  Rejected: new Set(),
  Returned: new Set(),
});

async function loadStaffTransactionSignature(client, userId) {
  const result = await client.query(`SELECT profile.full_name,signature.image_data,signature.mime_type,signature.image_hash
    FROM public.profiles profile
    LEFT JOIN public.custodian_signatures signature ON signature.custodian_user_id=profile.user_id
    WHERE profile.user_id=$1 AND profile.role='staff' AND profile.is_active=true`, [userId]);
  return result.rows[0] ?? null;
}

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

    borrowDate:
      source.borrowDate ??
      source.borrow_date,

    returnDate:
      source.returnDate ??
      source.return_date,

    purpose:
      source.purpose,

    departmentId: source.departmentId ?? source.department_id,
    sectionId: source.sectionId ?? source.section_id,
    assignedProfessorId: source.assignedProfessorId ?? source.assigned_professor_user_id,

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
    borrowDate: request.borrow_date,
    returnDate: request.return_date,
    purpose: request.purpose,
    departmentId: request.department_id ?? null,
    departmentName: request.department_name ?? null,
    departmentCode: request.department_code ?? null,
    sectionId: request.section_id ?? null,
    sectionName: request.section_name ?? null,
    assignedProfessorId: request.assigned_professor_user_id ?? null,
    assignedProfessorName: request.assigned_professor_name ?? null,
    status: String(request.status ?? "").toLowerCase(),
    requestedAt: request.created_at,
    actualReturnedAt: request.actual_returned_at ?? null,
    overdue: Boolean(request.overdue),
    authorizationStatus: request.authorization_status ?? null,
    authorizationToken: request.authorization_token ?? null,
    authorizedBy: request.professor_name ?? null,
    authorizedAt: request.authorized_at ?? null,
    custodianVerifiedBy: request.custodian_verified_name ?? null,
    custodianVerifiedAt: request.custodian_verified_at ?? null,
    custodianApprovedBy: request.custodian_approved_name ?? null,
    custodianApprovedAt: request.custodian_approved_at ?? null,
    items: Array.isArray(request.items) ? request.items : [],
  };
}

function normalizeReturn(body) {
  const source = body && typeof body === "object" ? body : {};
  const integer = (value) => typeof value === "number" && Number.isInteger(value) ? value
    : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : Number.NaN;
  return {
    remarks: typeof source.remarks === "string" ? source.remarks.trim() : "",
    idempotencyKey: typeof (source.idempotencyKey ?? source.idempotency_key) === "string"
      ? (source.idempotencyKey ?? source.idempotency_key).trim() : "",
    items: Array.isArray(source.items) ? source.items.map((item) => ({
      inventoryId: item?.inventoryId ?? item?.inventory_id,
      goodQuantity: integer(item?.goodQuantity ?? item?.good_quantity ?? 0),
      damagedQuantity: integer(item?.damagedQuantity ?? item?.damaged_quantity ?? 0),
      missingQuantity: integer(item?.missingQuantity ?? item?.missing_quantity ?? 0),
      conditionNote: typeof (item?.conditionNote ?? item?.condition_note) === "string"
        ? (item.conditionNote ?? item.condition_note).trim() : "",
    })) : [],
    assets: Array.isArray(source.assets) ? source.assets.map((asset) => ({
      token: typeof asset?.token === "string" ? asset.token.trim() : "",
      condition: typeof asset?.condition === "string" ? asset.condition.trim().toLowerCase() : "",
      conditionNote: typeof (asset?.conditionNote ?? asset?.condition_note) === "string"
        ? (asset.conditionNote ?? asset.condition_note).trim() : "",
    })) : [],
    missingAssets: Array.isArray(source.missingAssets ?? source.missing_assets) ? (source.missingAssets ?? source.missing_assets).map((asset) => ({
      assetId: asset?.assetId ?? asset?.asset_id,
      reason: typeof asset?.reason === "string" ? asset.reason.trim() : "",
    })) : [],
  };
}

function returnErrors(returnData) {
  const errors = [];
  if (returnData.idempotencyKey && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(returnData.idempotencyKey)) {
    errors.push("Return submission identifier is invalid.");
  }
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
    if ((item.damagedQuantity > 0 || item.missingQuantity > 0) && item.conditionNote.length < 5) {
      errors.push(`A condition note of at least 5 characters is required for damaged or missing inventory item '${id}'.`);
    }
    total += item.goodQuantity + item.damagedQuantity + item.missingQuantity;
  }
  if (returnData.items.length && total <= 0) errors.push("At least one unit must be accounted for.");
  const assetTokens = new Set();
  for (const asset of returnData.assets) {
    if (!asset.token) errors.push("Every serialized return must include its asset QR.");
    if (assetTokens.has(asset.token)) errors.push("The same serialized asset QR appears more than once.");
    assetTokens.add(asset.token);
    if (!["good", "fair", "damaged"].includes(asset.condition)) errors.push("Serialized return condition must be good, fair, or damaged.");
    if (asset.conditionNote.length > 500) errors.push("Serialized asset condition notes cannot exceed 500 characters.");
    if (asset.condition === "damaged" && asset.conditionNote.length < 5) errors.push("A condition note of at least 5 characters is required for a damaged serialized asset.");
  }
  const missingAssetIds = new Set();
  for (const asset of returnData.missingAssets) {
    const id = String(asset.assetId ?? "");
    if (!/^[1-9]\d*$/.test(id)) errors.push("Every missing serialized asset must have a valid asset ID.");
    if (missingAssetIds.has(id)) errors.push(`Serialized asset '${id}' is reported missing more than once.`);
    missingAssetIds.add(id);
    if (asset.reason.length < 5 || asset.reason.length > 500) errors.push(`Missing-asset reason for '${id}' must contain 5 to 500 characters.`);
  }
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

function getBorrowingPolicy(_req, res) {
  return res.json({
    maxItemsPerRequest: DEFAULT_POLICY.maxItemsPerRequest,
    maxQuantityPerRequest: DEFAULT_POLICY.maxQuantityPerStudent,
    leadTimeDays: DEFAULT_POLICY.leadTimeDays,
  });
}

async function getAssignmentOptions(req, res, next) {
  try {
    const [departments, sections, professors, rooms] = await Promise.all([
      pool.query(`SELECT id,code,name FROM public.academic_departments WHERE is_active=true ORDER BY name,id`),
      pool.query(`SELECT id,department_id,name FROM public.academic_sections WHERE is_active=true ORDER BY name,id`),
      pool.query(`SELECT user_id,department_id,full_name FROM public.profiles
        WHERE role='professor' AND is_active=true AND department_id IS NOT NULL ORDER BY full_name,user_id`),
      pool.query(`SELECT id,department_id,name,room_type FROM public.laboratory_rooms
        WHERE is_active=true AND ($1::boolean=false OR department_id=$2) ORDER BY department_id,name,id`,
        [req.user.role === "staff", req.user.department_id]),
    ]);
    return res.json({
      departments: departments.rows.map((row) => ({ id: row.id, code: row.code, name: row.name })),
      sections: sections.rows.map((row) => ({ id: row.id, departmentId: row.department_id, name: row.name })),
      professors: professors.rows.map((row) => ({ id: row.user_id, departmentId: row.department_id, fullName: row.full_name })),
      rooms: rooms.rows.map((row) => ({ id: row.id, departmentId: row.department_id, name: row.name, roomType: row.room_type })),
    });
  } catch (error) { return next(error); }
}

async function validateAcademicAssignment(client, request) {
  const departmentId = String(request.departmentId ?? "");
  const sectionId = String(request.sectionId ?? "");
  const professorId = String(request.assignedProfessorId ?? "");
  if (!/^[1-9]\d*$/.test(departmentId) || !/^[1-9]\d*$/.test(sectionId)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(professorId)) {
    return { code: "ACADEMIC_ASSIGNMENT_REQUIRED", message: "Select a valid department, section, and assigned professor." };
  }
  const result = await client.query(`SELECT department.id
    FROM public.academic_departments AS department
    JOIN public.academic_sections AS section ON section.department_id=department.id AND section.id=$2 AND section.is_active=true
    JOIN public.profiles AS professor ON professor.department_id=department.id AND professor.user_id=$3::uuid
      AND professor.role='professor' AND professor.is_active=true
    WHERE department.id=$1 AND department.is_active=true
    FOR KEY SHARE OF department,section,professor`, [departmentId, sectionId, professorId]);
  return result.rowCount ? null : { code: "INVALID_ACADEMIC_ASSIGNMENT", message: "The selected section or professor does not belong to the active department." };
}

function validateClaimWindow(returnDate, today) {
  const returned = String(returnDate ?? "").slice(0, 10);
  if (returned < today) {
    return {
      error: "CLAIM_WINDOW_EXPIRED",
      message: "This request has passed its return deadline and can no longer be released.",
    };
  }
  return null;
}

function validatePolicyConstraints({
  request,
  inventory = [],
  existingBorrowings = [],
  existingRequests = [],
  inventoryAvailability = {},
  policy = {},
  now = new Date(),
  outstandingBorrowingId = null,
  accountabilityCaseNumber = null,
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

  const reasons = result.violations.map((violation) => ({
    code: POLICY_REASON_CODES[violation.constraint] ?? "BORROWING_POLICY_VIOLATION",
    constraint: violation.constraint,
    message: violation.message,
  }));
  if (outstandingBorrowingId != null && !reasons.some((reason) => reason.constraint === "return_outstanding")) {
    reasons.push({
      code: "OUTSTANDING_BORROWING",
      constraint: "return_outstanding",
      message: `Student has an outstanding borrowing (request '${outstandingBorrowingId}'). All borrowed items must be returned before submitting another request.`,
    });
  }
  if (accountabilityCaseNumber) {
    reasons.push({
      code: "UNRESOLVED_ACCOUNTABILITY",
      constraint: "accountability",
      message: `Resolve accountability case '${accountabilityCaseNumber}' with the stockroom before submitting another request.`,
    });
  }

  return Object.freeze({
    valid: result.valid && outstandingBorrowingId == null && !accountabilityCaseNumber,
    checkedConstraints: result.checkedConstraints,
    reasons: Object.freeze(reasons),
  });
}

async function loadValidationContext(client, request, userId = null) {
  const inventoryIds = [...new Set(request.items.map((item) => String(item.inventoryId)).filter(Boolean))];
  if (inventoryIds.length === 0) return {
    inventory: [], existingBorrowings: [], existingRequests: [], inventoryAvailability: {},
  };

  // Inventory locks serialize capacity checks. The student-scoped advisory
  // lock additionally serializes disjoint-item requests by the same borrower,
  // preventing simultaneous duplicate or schedule-conflicting inserts.
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [userId ? `user:${userId}` : `student:${request.studentId.trim().toLowerCase()}`]
  );

  const accountabilityResult = userId ? await client.query(
    `SELECT case_number FROM public.accountability_cases
      WHERE user_id=$1::uuid AND status IN ('open','under_review')
      ORDER BY created_at,id LIMIT 1`, [userId]
  ) : { rows: [] };

  const inventoryResult = await client.query(
    `SELECT inventory.id, inventory.item_name, inventory.quantity, inventory.additional_qty, inventory.replaces, inventory.missing,
            inventory.breakage,
            inventory.defective + CASE WHEN inventory.tracking_type='serialized' THEN
              (SELECT count(*)::integer FROM public.inventory_assets asset WHERE asset.inventory_id=inventory.id AND asset.status='available' AND asset.next_inspection_date IS NOT NULL AND asset.next_inspection_date <= $2::date)
              ELSE 0 END AS defective,
            inventory.total_loss
      FROM inventory
      WHERE inventory.id::text = ANY($1::text[])
      ORDER BY inventory.id
      FOR UPDATE`,
    [inventoryIds, request.returnDate]
  );

  const reservationsResult = await client.query(
    `WITH returned AS (
       SELECT request_id, inventory_id,
              SUM(good_quantity + damaged_quantity + missing_quantity)::bigint AS accounted
         FROM borrowing_return_items
        GROUP BY request_id, inventory_id
     )
     SELECT bri.inventory_id,
            COALESCE(SUM(CASE
              WHEN br.status = 'Borrowed' THEN GREATEST(bri.quantity - COALESCE(returned.accounted, 0), 0)
              ELSE bri.quantity
            END), 0)::bigint AS quantity,
            count(*) FILTER (WHERE bri.quantity IS NULL OR bri.quantity <= 0
              OR COALESCE(returned.accounted, 0) < 0
              OR COALESCE(returned.accounted, 0) > bri.quantity) > 0 AS has_invalid_quantity
       FROM borrow_request_items bri
       JOIN borrow_requests br ON br.id = bri.request_id
       LEFT JOIN returned ON returned.request_id = bri.request_id AND returned.inventory_id = bri.inventory_id
      WHERE bri.inventory_id::text = ANY($1::text[])
        AND (br.status = 'Borrowed' OR (
          br.status = ANY($2::text[])
          AND br.borrow_date <= $3::date
          AND br.return_date >= $4::date
        ))
      GROUP BY bri.inventory_id`,
    [inventoryIds, ["Pending", "Validated", "Approved"], request.returnDate, request.borrowDate]
  );

  const outstandingResult = await client.query(
    `SELECT request.id
       FROM public.borrow_requests request
      WHERE (($1::uuid IS NOT NULL AND request.user_id = $1::uuid)
        OR (request.user_id IS NULL AND lower(trim(request.student_id)) = $2))
        AND (request.status = 'Borrowed' OR (request.status = 'Approved'
          AND request.borrow_date >= (now() AT TIME ZONE 'Asia/Manila')::date))
      ORDER BY request.id
      LIMIT 1`,
    [userId, request.studentId.trim().toLowerCase()]
  );

  const conflictsResult = await client.query(
    `SELECT br.id, br.student_id, br.borrow_date, br.return_date, br.purpose, br.status,
            bri.inventory_id, bri.quantity
       FROM borrow_requests br
       LEFT JOIN borrow_request_items bri ON bri.request_id = br.id
      WHERE (($1::uuid IS NOT NULL AND br.user_id = $1::uuid)
        OR (br.user_id IS NULL AND lower(trim(br.student_id)) = $2))
        AND br.status = ANY($3::text[])
        AND (br.status = 'Borrowed' OR br.borrow_date >= (now() AT TIME ZONE 'Asia/Manila')::date)
      ORDER BY br.id, bri.inventory_id`,
    [userId, request.studentId.trim().toLowerCase(), ACTIVE_BORROWING_STATUSES]
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
    outstandingBorrowingId: outstandingResult.rows[0]?.id ?? null,
    accountabilityCaseNumber: accountabilityResult.rows[0]?.case_number ?? null,
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
    if (validationOptions.requireAcademicAssignment) {
      const assignmentError = await validateAcademicAssignment(client, request);
      if (assignmentError) {
        await client.query("ROLLBACK");
        return { request, validation: { valid: false, status: "Rejected", reasons: [assignmentError], assignment: null, checkedConstraints: [], conflicts: [] } };
      }
    }
    const context = await loadValidationContext(client, request, validationOptions.userId ?? null);
    const cspValidation = validateBorrowingRequest({ request, ...context });
    const policyValidation = validatePolicyConstraints({
      request,
      ...context,
      inventoryAvailability: validationOptions.inventoryAvailability ?? context.inventoryAvailability,
      policy: validationOptions.policy,
      now: validationOptions.now,
      outstandingBorrowingId: context.outstandingBorrowingId,
      accountabilityCaseNumber: context.accountabilityCaseNumber,
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
          borrow_date,
          return_date,
          purpose,
          status,
          user_id,
          department_id,
          section_id,
          assigned_professor_user_id
        )
      VALUES
        (
          $1,
          $2,
          $3::date,
          $4::date,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10::uuid
        )
      RETURNING *`,
      [
        request.studentName.trim(),
        request.studentId.trim(),
        request.borrowDate,
        request.returnDate,
        request.purpose.trim(),
        "Pending",
        validationOptions.userId ?? null,
        request.departmentId,
        request.sectionId,
        request.assignedProfessorId,
      ]
    );
    const savedRequest = requestResult.rows[0];
    const authorizationResult = await client.query(
      `INSERT INTO public.borrow_request_authorizations (request_id) VALUES ($1) RETURNING review_token`,
      [savedRequest.id]
    );
    savedRequest.authorization_token = authorizationResult.rows[0].review_token;

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
    await notifyUser(client, request.assignedProfessorId, {
      type: "borrowing_submitted",
      title: "New borrowing request",
      message: `${savedRequest.student_name} submitted a borrowing request for ${savedRequest.borrow_date}.`,
      relatedPath: "/professor/requests",
      entityType: "borrowing_request",
      entityId: savedRequest.id,
    });
    await notifyRoles(client, ["admin"], {
      type: "borrowing_submitted", title: "New borrowing request",
      message: `${savedRequest.student_name} submitted a borrowing request for ${savedRequest.borrow_date}.`,
      relatedPath: "/admin/requests", entityType: "borrowing_request", entityId: savedRequest.id,
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
    await processExpiredRequests();
    const result = await withValidation(
      authenticatedStudentRequest(req.body, req.user),
      false,
      pool,
      { userId: req.user.id, actor: req.user, requireAcademicAssignment: true }
    );
    return res.status(result.validation.valid ? 200 : 422).json(result);
  } catch (error) {
    return next(error);
  }
}

async function listBorrowRequests(req, res, next) {
  try {
    await processExpiredRequests();
    const studentOnly = req.user.role === "student";
    const result = await pool.query(
      `SELECT br.id, br.student_name, br.student_id, br.borrow_date,
              br.return_date, br.actual_returned_at, br.purpose, br.status, br.created_at,
              br.department_id,department.name AS department_name,department.code AS department_code,
              br.section_id,section.name AS section_name,br.assigned_professor_user_id,
              professor.full_name AS assigned_professor_name,
              (SELECT status FROM public.borrow_request_authorizations WHERE request_id=br.id) AS authorization_status,
              (SELECT review_token FROM public.borrow_request_authorizations WHERE request_id=br.id) AS authorization_token,
              (SELECT professor_name FROM public.borrow_request_authorizations WHERE request_id=br.id) AS professor_name,
              (SELECT authorized_at FROM public.borrow_request_authorizations WHERE request_id=br.id) AS authorized_at,
              (SELECT verified_name FROM public.borrow_request_custodian_authorizations WHERE request_id=br.id) AS custodian_verified_name,
              (SELECT verified_at FROM public.borrow_request_custodian_authorizations WHERE request_id=br.id) AS custodian_verified_at,
              (SELECT approved_name FROM public.borrow_request_custodian_authorizations WHERE request_id=br.id) AS custodian_approved_name,
              (SELECT approved_at FROM public.borrow_request_custodian_authorizations WHERE request_id=br.id) AS custodian_approved_at,
              (br.status = 'Borrowed' AND br.return_date < (now() AT TIME ZONE 'Asia/Manila')::date) AS overdue,
              COALESCE(
                json_agg(json_build_object(
                  'name', inventory.item_name,
                  'inventoryId', bri.inventory_id,
                  'quantity', bri.quantity,
                  'trackingType', inventory.tracking_type,
                  'assets', (SELECT COALESCE(json_agg(json_build_object(
                    'assetNumber', asset.asset_number, 'serialNumber', asset.serial_number,
                    'status', asset.status, 'condition', asset.condition,
                    'returnedAt', assignment.returned_at, 'returnCondition', assignment.return_condition
                  ) ORDER BY asset.asset_number), '[]'::json)
                    FROM borrowing_asset_assignments assignment
                    JOIN inventory_assets asset ON asset.id=assignment.asset_id
                    WHERE assignment.request_id=br.id AND assignment.inventory_id=bri.inventory_id),
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
         LEFT JOIN public.academic_departments department ON department.id=br.department_id
         LEFT JOIN public.academic_sections section ON section.id=br.section_id
         LEFT JOIN public.profiles professor ON professor.user_id=br.assigned_professor_user_id
         LEFT JOIN (
           SELECT request_id, inventory_id,
                  SUM(good_quantity)::integer AS good_quantity,
                  SUM(damaged_quantity)::integer AS damaged_quantity,
                  SUM(missing_quantity)::integer AS missing_quantity,
                  SUM(good_quantity + damaged_quantity + missing_quantity)::integer AS accounted_quantity
             FROM borrowing_return_items GROUP BY request_id, inventory_id
         ) returned ON returned.request_id = br.id AND returned.inventory_id = bri.inventory_id
        WHERE ($1::boolean = false OR br.user_id = $2::uuid)
          AND ($3::boolean = false OR br.assigned_professor_user_id = $2::uuid)
          AND ($4::boolean = false OR br.department_id = $5::bigint)
        GROUP BY br.id,department.id,section.id,professor.user_id
        ORDER BY br.created_at DESC, br.id DESC`,
      [studentOnly, req.user.id, req.user.role === "professor", ["staff", "department_head"].includes(req.user.role), req.user.department_id]
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
    if (returnData.idempotencyKey) {
      const duplicateResult = await client.query(
        `SELECT returned.*, request.status AS request_status
           FROM borrowing_returns returned
           JOIN borrow_requests request ON request.id=returned.request_id
          WHERE returned.idempotency_key=$1`, [returnData.idempotencyKey]
      );
      if (duplicateResult.rowCount) {
        await client.query("ROLLBACK");
        const existing = duplicateResult.rows[0];
        if (String(existing.request_id) !== String(requestId)) {
          return res.status(409).json({ error: "RETURN_IDENTIFIER_REUSED", message: "This return submission identifier belongs to another request." });
        }
        return res.json({ return: existing, request: { id: Number(requestId), status: existing.request_status }, complete: existing.request_status === "Returned", duplicate: true });
      }
    }
    const request = requestResult.rows[0];
    if (req.user.role === "staff" && String(request.department_id) !== String(req.user.department_id)) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "REQUEST_NOT_FOUND", message: "Borrowing request was not found in your department." });
    }
    if (request.status !== "Borrowed") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "REQUEST_NOT_BORROWED", message: "Only borrowed requests can be returned." });
    }
    const receivingSignature = await loadStaffTransactionSignature(client, req.user.id);
    if (!receivingSignature?.image_data) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error:"SIGNATURE_REQUIRED",message:"Save your Custodian Signature before receiving returned items." });
    }

    const requestedResult = await client.query(
      `SELECT inventory_id, quantity FROM borrow_request_items WHERE request_id = $1 ORDER BY inventory_id FOR UPDATE`, [requestId]
    );
    const trackingResult = await client.query(
      `SELECT id, tracking_type FROM inventory WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE`,
      [requestedResult.rows.map((item) => item.inventory_id)]
    );
    const trackingById = new Map(trackingResult.rows.map((item) => [String(item.id), item.tracking_type]));
    for (const item of requestedResult.rows) item.tracking_type = trackingById.get(String(item.inventory_id)) ?? "bulk";
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

    const parsedReturnAssets = returnData.assets.map((asset) => ({ ...asset, parsed: parseAssetQr(asset.token) }));
    if (parsedReturnAssets.some((asset) => !asset.parsed)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "INVALID_ASSET_QR", message: "One or more serialized asset QR codes are invalid." });
    }
    let returnedAssetRows = [];
    if (parsedReturnAssets.length) {
      const publicIds = parsedReturnAssets.map((entry) => entry.parsed.publicId);
      if (new Set(publicIds).size !== publicIds.length) { await client.query("ROLLBACK"); return res.status(409).json({ error: "DUPLICATE_ASSET_SCAN", message: "The same serialized asset was scanned more than once." }); }
      const assetResult = await client.query(
        `SELECT asset.*, assignment.id AS assignment_id
           FROM public.inventory_assets asset JOIN public.borrowing_asset_assignments assignment ON assignment.asset_id=asset.id
          WHERE asset.qr_public_id=ANY($1::uuid[]) AND assignment.request_id=$2 AND assignment.returned_at IS NULL
          ORDER BY asset.id FOR UPDATE OF asset, assignment`, [publicIds, requestId]
      );
      if (assetResult.rowCount !== parsedReturnAssets.length) { await client.query("ROLLBACK"); return res.status(409).json({ error: "ASSET_NOT_ASSIGNED", message: "A scanned asset is not an outstanding unit from this request." }); }
      const submittedById = new Map(parsedReturnAssets.map((entry) => [entry.parsed.publicId.toLowerCase(), entry]));
      returnedAssetRows = assetResult.rows.map((row) => ({ ...row, submitted: submittedById.get(String(row.qr_public_id).toLowerCase()) }));
      if (returnedAssetRows.some((row) => row.qr_version !== row.submitted.parsed.version || row.status !== "borrowed" || String(row.current_borrow_request_id) !== String(requestId))) {
        await client.query("ROLLBACK"); return res.status(409).json({ error: "ASSET_RETURN_STATE_INVALID", message: "A scanned asset QR is outdated or its assignment state changed." });
      }
    }
    let missingAssetRows = [];
    if (returnData.missingAssets.length) {
      const missingIds = returnData.missingAssets.map((asset) => String(asset.assetId));
      const missingResult = await client.query(
        `SELECT asset.*, assignment.id AS assignment_id
           FROM public.inventory_assets asset JOIN public.borrowing_asset_assignments assignment ON assignment.asset_id=asset.id
          WHERE asset.id=ANY($1::bigint[]) AND assignment.request_id=$2 AND assignment.returned_at IS NULL
          ORDER BY asset.id FOR UPDATE OF asset, assignment`, [missingIds, requestId]
      );
      if (missingResult.rowCount !== missingIds.length) { await client.query("ROLLBACK"); return res.status(409).json({ error: "MISSING_ASSET_NOT_OUTSTANDING", message: "A selected asset is not an outstanding unit from this request or was already reported." }); }
      const reasonById = new Map(returnData.missingAssets.map((asset) => [String(asset.assetId), asset.reason]));
      missingAssetRows = missingResult.rows.map((row) => ({ ...row, incidentReason: reasonById.get(String(row.id)) }));
      if (missingAssetRows.some((row) => row.status !== "borrowed" || String(row.current_borrow_request_id) !== String(requestId))) {
        await client.query("ROLLBACK"); return res.status(409).json({ error: "MISSING_ASSET_STATE_INVALID", message: "A selected asset is no longer assigned as borrowed for this request." });
      }
      const scannedIds = new Set(returnedAssetRows.map((asset) => String(asset.id)));
      if (missingAssetRows.some((asset) => scannedIds.has(String(asset.id)))) { await client.query("ROLLBACK"); return res.status(409).json({ error: "ASSET_RETURN_CONFLICT", message: "An asset cannot be both scanned as returned and reported missing." }); }
    }
    for (const requestedItem of requestedResult.rows.filter((item) => item.tracking_type === "serialized")) {
      const submitted = submittedItems.find((item) => String(item.inventoryId) === String(requestedItem.inventory_id));
      const assets = returnedAssetRows.filter((asset) => String(asset.inventory_id) === String(requestedItem.inventory_id));
      const missingAssets = missingAssetRows.filter((asset) => String(asset.inventory_id) === String(requestedItem.inventory_id));
      const accounted = submitted ? submitted.goodQuantity + submitted.damagedQuantity + submitted.missingQuantity : 0;
      const good = assets.filter((asset) => ["good", "fair"].includes(asset.submitted.condition)).length;
      const damaged = assets.filter((asset) => asset.submitted.condition === "damaged").length;
      if (accounted !== assets.length + missingAssets.length || (submitted && (submitted.goodQuantity !== good || submitted.damagedQuantity !== damaged || submitted.missingQuantity !== missingAssets.length))) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "SERIALIZED_RETURN_SCAN_MISMATCH", message: "Serialized return totals must match every scanned or explicitly reported missing asset." });
      }
    }

    const returnResult = await client.query(
      `INSERT INTO borrowing_returns (request_id, processed_by, remarks, idempotency_key) VALUES ($1, $2, $3, $4) RETURNING *`,
      [requestId, req.user.id, returnData.remarks || null, returnData.idempotencyKey || null]
    );
    await client.query(`INSERT INTO public.borrowing_transaction_signatures
      (request_id,transaction_type,return_id,staff_user_id,staff_name,signature_image,signature_mime_type,signature_hash)
      VALUES ($1,'return',$2,$3,$4,$5,$6,$7)`,[requestId,returnResult.rows[0].id,req.user.id,receivingSignature.full_name,
      receivingSignature.image_data,receivingSignature.mime_type,receivingSignature.image_hash]);
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
      for (const [incidentType, affectedQuantity] of [["damaged", item.damagedQuantity], ["missing", item.missingQuantity]]) {
        if (affectedQuantity <= 0) continue;
        const accountability = await client.query(
          `INSERT INTO public.accountability_cases
            (request_id,return_id,inventory_id,user_id,incident_type,affected_quantity,description,evidence_notes,opened_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8)
           ON CONFLICT (return_id,inventory_id,incident_type) WHERE return_id IS NOT NULL DO NOTHING
           RETURNING id,case_number`,
          [requestId,returnResult.rows[0].id,item.inventoryId,request.user_id,incidentType,affectedQuantity,item.conditionNote,req.user.id]
        );
        if (accountability.rowCount) {
          await writeAuditLog(client,req.user,{ action:"accountability_case_created",entityType:"accountability_case",entityId:accountability.rows[0].id,newValues:{caseNumber:accountability.rows[0].case_number,requestId,incidentType,affectedQuantity} });
          await notifyUser(client,request.user_id,{ type:"accountability_created",title:"Accountability case opened",message:`${accountability.rows[0].case_number} was opened for ${affectedQuantity} ${incidentType} unit(s). Review the case details and coordinate with the stockroom.`,relatedPath:"/my-accountability",entityType:"accountability_case",entityId:accountability.rows[0].id });
        }
      }
      previous.set(String(item.inventoryId), (previous.get(String(item.inventoryId)) ?? 0) + accounted);
    }
    for (const asset of returnedAssetRows) {
      const damaged = asset.submitted.condition === "damaged";
      await client.query(
        `UPDATE public.borrowing_asset_assignments SET returned_by=$2, returned_at=now(), return_condition=$3, condition_note=$4, return_id=$5 WHERE id=$1`,
        [asset.assignment_id, req.user.id, asset.submitted.condition, asset.submitted.conditionNote || null, returnResult.rows[0].id]
      );
      await client.query(
        `UPDATE public.inventory_assets SET status=$2, condition=$3, maintenance_note=$4,
           current_borrow_request_id=NULL, current_borrower_user_id=NULL, updated_at=now() WHERE id=$1`,
        [asset.id, damaged ? "maintenance" : "available", asset.submitted.condition, damaged ? asset.submitted.conditionNote : null]
      );
      if (damaged) {
        await client.query(
          `INSERT INTO public.asset_maintenance_records
            (asset_id, inventory_id, source, status, problem_description, opened_by)
           SELECT $1,$2,'damaged_return','under_inspection',$3,$4
           WHERE NOT EXISTS (SELECT 1 FROM public.asset_maintenance_records WHERE asset_id=$1 AND status IN ('under_inspection','under_repair'))`,
          [asset.id, asset.inventory_id, asset.submitted.conditionNote, req.user.id]
        );
      }
    }
    for (const asset of missingAssetRows) {
      await client.query(
        `UPDATE public.borrowing_asset_assignments SET returned_by=$2, returned_at=now(), return_condition='missing', condition_note=$3, return_id=$4 WHERE id=$1`,
        [asset.assignment_id, req.user.id, asset.incidentReason, returnResult.rows[0].id]
      );
      await client.query(
        `UPDATE public.inventory_assets SET status='missing', condition='missing', maintenance_note=$2,
           current_borrow_request_id=NULL, current_borrower_user_id=NULL, updated_at=now() WHERE id=$1`, [asset.id, asset.incidentReason]
      );
      const incident = await client.query(
        `INSERT INTO public.serialized_asset_incidents (request_id, assignment_id, asset_id, reason, reported_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`, [requestId, asset.assignment_id, asset.id, asset.incidentReason, req.user.id]
      );
      await writeAuditLog(client, req.user, { action: "serialized_asset_reported_missing", entityType: "serialized_asset_incident", entityId: incident.rows[0].id, newValues: { requestId, assetId: asset.id, assetNumber: asset.asset_number, reason: asset.incidentReason } });
    }
    if (missingAssetRows.length) {
      await notifyRoles(client, ["admin"], {
        type: "serialized_asset_missing", title: "Serialized asset reported missing",
        message: `${missingAssetRows.map((asset) => asset.asset_number).join(", ")} reported missing from BR-${String(requestId).padStart(3, "0")}.`,
        relatedPath: "/admin/inventory", entityType: "borrowing_request", entityId: requestId,
      });
    }

    const complete = requestedResult.rows.every((item) => (previous.get(String(item.inventory_id)) ?? 0) === Number(item.quantity));
    const updatedResult = await client.query(
      `UPDATE borrow_requests SET status = CASE WHEN $2 THEN 'Returned' ELSE status END,
          actual_returned_at = CASE WHEN $2 THEN now() ELSE actual_returned_at END,
          overdue_resolved_at = CASE WHEN $2 AND overdue_detected_at IS NOT NULL THEN now() ELSE overdue_resolved_at END,
          updated_at = now()
        WHERE id = $1 RETURNING *`, [requestId, complete]
    );
    const returnedUnits = submittedItems.reduce(
      (sum, item) => sum + item.goodQuantity + item.damagedQuantity + item.missingQuantity, 0
    );
    const returnedItems = submittedItems.map((item) =>
      `item #${item.inventoryId}: ${item.goodQuantity} good, ${item.damagedQuantity} damaged, ${item.missingQuantity} missing`
    ).join("; ");
    await client.query(
      `INSERT INTO calendar_events
        (title, event_date, event_type, description, borrow_request_id, borrowing_return_id)
       VALUES ($1, (now() AT TIME ZONE 'Asia/Manila')::date, $2, $3, $4, $5)`,
      [
        `${complete ? "Returned" : "Partial return"}: BR-${String(requestId).padStart(3, "0")}`,
        complete ? "return_completed" : "return_partial",
        `${returnedUnits} unit(s) accounted for (${returnedItems}). ${complete ? "All items returned." : "Outstanding items remain."}`,
        requestId,
        returnResult.rows[0].id,
      ]
    );
    if (complete) {
      await client.query(`DELETE FROM calendar_events WHERE borrow_request_id = $1 AND event_type = 'return_due'`, [requestId]);
    }

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
    const receipt = await createTransactionReceipt(client, { requestId, receiptType: "return", returnId: returnResult.rows[0].id, createdBy: req.user.id });
    await writeAuditLog(client, req.user, {
      action: "transaction_receipt_created",
      entityType: "transaction_receipt",
      entityId: receipt.id,
      newValues: {
        receiptNumber: receipt.receipt_number,
        receiptType: "return",
        requestId,
        returnId: returnResult.rows[0].id,
      },
    });
    await client.query("COMMIT");
    return res.status(201).json({ return: returnResult.rows[0], request: updatedResult.rows[0], receipt, complete });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

async function createBorrowRequest(req, res, next) {
  try {
    await processExpiredRequests();
    const result = await withValidation(
      authenticatedStudentRequest(req.body, req.user),
      true,
      pool,
      { userId: req.user.id, actor: req.user, requireAcademicAssignment: true }
    );
    return res.status(result.validation.valid ? 201 : 422).json(result);
  } catch (error) {
    return next(error);
  }
}

async function updateBorrowRequestStatus(req, res, next) {
  const requestId = req.params.id;
  const nextStatus = req.body?.status;
  if (!/^[1-9]\d*$/.test(String(requestId ?? ""))) {
    return res.status(400).json({ error: "INVALID_REQUEST_ID", message: "Borrowing request ID is invalid." });
  }
  try {
    await processExpiredRequests();
  } catch (error) {
    return next(error);
  }

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
    if (req.user.role === "staff" && String(request.department_id) !== String(req.user.department_id)) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "REQUEST_NOT_FOUND", message: "Borrowing request was not found in your department." });
    }
    if (req.user.role === "professor" && String(request.assigned_professor_user_id ?? "") !== String(req.user.id)) {
      await writeAuditLog(client, req.user, { action: "borrowing_assignment_access_denied", entityType: "borrowing_request", entityId: requestId,
        metadata: { attemptedStatus: nextStatus, reason: request.assigned_professor_user_id ? "NOT_ASSIGNED_PROFESSOR" : "PROFESSOR_NOT_ASSIGNED" } });
      await client.query("COMMIT");
      return res.status(request.assigned_professor_user_id ? 403 : 409).json({
        error: request.assigned_professor_user_id ? "NOT_ASSIGNED_PROFESSOR" : "PROFESSOR_NOT_ASSIGNED",
        message: request.assigned_professor_user_id ? "This request is assigned to another professor." : "This request has no assigned professor.",
      });
    }
    if (nextStatus === "Approved") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "CUSTODIAN_WORKFLOW_REQUIRED", message: "Complete custodian verification and approval instead of changing this status directly." });
    }
    if (nextStatus === "Rejected" && req.user.role === "professor"
      && String(req.body?.reason ?? "").trim().length < 5) {
      await client.query("ROLLBACK");
      return res.status(422).json({ error: "REJECTION_REASON_REQUIRED", message: "Provide a rejection reason of at least 5 characters." });
    }
    const allowed = STATUS_TRANSITIONS[request.status];
    if (!allowed || !allowed.has(nextStatus)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "INVALID_STATUS_TRANSITION",
        message: `Cannot change a borrowing request from '${request.status}' to '${nextStatus}'.`,
      });
    }

    let releaseDateKey = null;
    let releaseReturnDate = null;
    let releasingSignature = null;
    if (nextStatus === "Borrowed") {
      if (req.user.role !== "staff") {
        await client.query("ROLLBACK");
        return res.status(403).json({ error:"STAFF_RELEASE_REQUIRED",message:"A department Staff account must scan and release the items." });
      }
      let claim;
      try {
        claim = verifyClaimTicket(req.body?.claimToken, { requestId, staffId: req.user.id });
      } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "QR_NOT_CONFIGURED") {
          return res.status(503).json({ error: error.code, message: error.message });
        }
        throw error;
      }
      if (!claim || claim.userId !== request.user_id || req.body?.identityVerified !== true) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          error: "VERIFIED_QR_REQUIRED",
          message: "Scan the borrower's current account QR and confirm their identity before releasing items.",
        });
      }
      releasingSignature = await loadStaffTransactionSignature(client, req.user.id);
      if (!releasingSignature?.image_data) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error:"SIGNATURE_REQUIRED",message:"Save your Custodian Signature before releasing items." });
      }
      const qrState = await client.query(`SELECT is_active, qr_status, qr_version, qr_revoked_at FROM public.profiles WHERE user_id=$1`, [request.user_id]);
      const qrProfile = qrState.rows[0];
      if (!qrProfile || !qrProfile.is_active || qrProfile.qr_status !== "active" || qrProfile.qr_revoked_at || qrProfile.qr_version !== claim.qrVersion) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "QR_NO_LONGER_ACTIVE", message: "The borrower's QR was revoked, replaced, or deactivated. Scan the currently issued QR again." });
      }
      const returnDate = request.return_date.toISOString?.().slice(0, 10) || String(request.return_date).slice(0, 10);
      releaseReturnDate = returnDate;
      const todayParts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(new Date());
      const today = Object.fromEntries(todayParts.map((part) => [part.type, part.value]));
      releaseDateKey = `${today.year}-${today.month}-${today.day}`;
      const claimWindowError = validateClaimWindow(returnDate, releaseDateKey);
      if (claimWindowError) {
        await client.query("ROLLBACK");
        return res.status(409).json(claimWindowError);
      }
    }

    const itemsResult = await client.query(
      `SELECT inventory_id, quantity
         FROM borrow_request_items
        WHERE request_id = $1
        ORDER BY inventory_id
        FOR UPDATE`,
      [requestId]
    );

    let scannedAssets = [];
    const consumedAssetIds = new Set();
    if (nextStatus === "Borrowed") {
      const tokens = Array.isArray(req.body?.assetTokens) ? req.body.assetTokens : [];
      if (tokens.length > 500) { await client.query("ROLLBACK"); return res.status(422).json({ error: "TOO_MANY_ASSET_SCANS", message: "Too many serialized assets were submitted at once." }); }
      const parsed = tokens.map(parseAssetQr);
      if (parsed.some((entry) => !entry)) { await client.query("ROLLBACK"); return res.status(400).json({ error: "INVALID_ASSET_QR", message: "One or more serialized asset QR codes are invalid." }); }
      const publicIds = parsed.map((entry) => entry.publicId);
      if (new Set(publicIds).size !== publicIds.length) { await client.query("ROLLBACK"); return res.status(409).json({ error: "DUPLICATE_ASSET_SCAN", message: "The same serialized asset was scanned more than once." }); }
      if (publicIds.length) {
        const assetsResult = await client.query(
          `SELECT * FROM public.inventory_assets WHERE qr_public_id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [publicIds]
        );
        if (assetsResult.rowCount !== publicIds.length) { await client.query("ROLLBACK"); return res.status(404).json({ error: "ASSET_NOT_FOUND", message: "One or more scanned assets are unknown." }); }
        const versionById = new Map(parsed.map((entry) => [entry.publicId.toLowerCase(), entry.version]));
        if (assetsResult.rows.some((asset) => versionById.get(String(asset.qr_public_id).toLowerCase()) !== asset.qr_version)) {
          await client.query("ROLLBACK"); return res.status(409).json({ error: "ASSET_QR_OUTDATED", message: "One or more asset QR codes have been replaced." });
        }
        scannedAssets = assetsResult.rows;
      }
    }

    for (const item of itemsResult.rows) {
      const lockedInventory = await client.query(`SELECT * FROM inventory WHERE id = $1 FOR UPDATE`, [item.inventory_id]);
      if (!lockedInventory.rowCount) throw new Error(`Inventory item '${item.inventory_id}' no longer exists.`);
      if (nextStatus === "Borrowed") {
        const commitment = await loadInventoryCommitment(client, item.inventory_id, requestId);
        const required = commitment.borrowed + Number(item.quantity);
        if (!commitment.valid || !Number.isSafeInteger(required)) {
          await client.query("ROLLBACK");
          return res.status(409).json({ error: "INVALID_COMMITMENT_DATA", message: "Existing borrowing commitments are inconsistent. The release was not processed." });
        }
        if (usableInventoryQuantity(lockedInventory.rows[0]) < required) {
          await client.query("ROLLBACK");
          return res.status(409).json({ error: "INSUFFICIENT_INVENTORY_AT_RELEASE", message: `Inventory item '${item.inventory_id}' no longer has enough physical units for release.` });
        }
        if (lockedInventory.rows[0].tracking_type === "serialized") {
          const matchingAssets = scannedAssets.filter((asset) => String(asset.inventory_id) === String(item.inventory_id));
          if (matchingAssets.length !== Number(item.quantity)) {
            await client.query("ROLLBACK");
            return res.status(409).json({ error: "SERIALIZED_ASSET_COUNT_MISMATCH", message: `Scan exactly ${item.quantity} serialized asset(s) for '${lockedInventory.rows[0].item_name}'.` });
          }
          const unavailable = matchingAssets.find((asset) => asset.status !== "available" || !["good", "fair"].includes(asset.condition) || (asset.next_inspection_date && String(asset.next_inspection_date).slice(0, 10) <= releaseReturnDate));
          if (unavailable) {
            await client.query("ROLLBACK");
            return res.status(409).json({ error: "ASSET_NOT_AVAILABLE", message: `${unavailable.asset_number} is borrowed, under maintenance, retired, due for inspection, or not in releasable condition.` });
          }
          for (const asset of matchingAssets) {
            consumedAssetIds.add(String(asset.id));
            await client.query(
              `INSERT INTO public.borrowing_asset_assignments (request_id, inventory_id, asset_id, released_by)
               VALUES ($1,$2,$3,$4)`, [requestId, item.inventory_id, asset.id, req.user.id]
            );
            const assigned = await client.query(
              `UPDATE public.inventory_assets SET status='borrowed', current_borrow_request_id=$1,
                 current_borrower_user_id=$2, updated_at=now() WHERE id=$3 AND status='available'
                 AND (next_inspection_date IS NULL OR next_inspection_date > $4::date) RETURNING id`,
              [requestId, request.user_id, asset.id, releaseReturnDate]
            );
            if (!assigned.rowCount) throw new Error(`Serialized asset '${asset.asset_number}' changed while it was being released.`);
          }
        }
      }
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
          SET status = $1,
              approved_by = CASE WHEN $1='Approved' THEN $3 ELSE approved_by END,
              approved_at = CASE WHEN $1='Approved' THEN now() ELSE approved_at END,
              released_by = CASE WHEN $1='Borrowed' THEN $3 ELSE released_by END,
              released_at = CASE WHEN $1='Borrowed' THEN now() ELSE released_at END,
              borrower_identity_verified = CASE WHEN $1='Borrowed' THEN true ELSE borrower_identity_verified END,
              updated_at = now()
        WHERE id = $2
      RETURNING *`,
      [nextStatus, requestId, req.user.id]
    );

    if (nextStatus === "Approved") {
      await client.query(
        `INSERT INTO calendar_events
          (title, event_date, event_type, description, borrow_request_id)
         VALUES ($1, $2, 'borrowing', $3, $4)
         ON CONFLICT (borrow_request_id, event_type)
           WHERE borrow_request_id IS NOT NULL AND event_type IN ('borrowing', 'return_due')
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

    if (nextStatus === "Borrowed") {
      const extra = scannedAssets.find((asset) => !consumedAssetIds.has(String(asset.id)));
      if (extra) { await client.query("ROLLBACK"); return res.status(409).json({ error: "ASSET_NOT_REQUESTED", message: `${extra.asset_number} does not belong to this borrowing request.` }); }
      await client.query(`INSERT INTO public.borrowing_transaction_signatures
        (request_id,transaction_type,staff_user_id,staff_name,signature_image,signature_mime_type,signature_hash)
        VALUES ($1,'release',$2,$3,$4,$5,$6)`,[requestId,req.user.id,releasingSignature.full_name,
        releasingSignature.image_data,releasingSignature.mime_type,releasingSignature.image_hash]);
    }

    if (nextStatus === "Borrowed") {
      await client.query(
        `INSERT INTO calendar_events (title, event_date, event_type, description, borrow_request_id)
         VALUES ($1, (now() AT TIME ZONE 'Asia/Manila')::date, 'borrowing', $2, $3)
         ON CONFLICT (borrow_request_id, event_type)
           WHERE borrow_request_id IS NOT NULL AND event_type IN ('borrowing', 'return_due')
         DO UPDATE SET title = excluded.title, event_date = excluded.event_date,
                       description = excluded.description, updated_at = now()`,
        [`Borrowed: BR-${String(requestId).padStart(3, "0")}`,
          `${request.student_name} borrowed ${itemsResult.rows.map((item) => `item #${item.inventory_id} × ${item.quantity}`).join("; ")}. Return due ${request.return_date.toISOString?.().slice(0, 10) || request.return_date}.`,
          requestId]
      );
      await client.query(
        `INSERT INTO calendar_events (title, event_date, event_type, description, borrow_request_id)
         VALUES ($1, $2::date, 'return_due', $3, $4)
         ON CONFLICT (borrow_request_id, event_type)
           WHERE borrow_request_id IS NOT NULL AND event_type IN ('borrowing', 'return_due')
         DO UPDATE SET event_date = excluded.event_date, updated_at = now()`,
        [`Return due: BR-${String(requestId).padStart(3, "0")}`,
          request.return_date,
          "Return all outstanding items by this date.",
          requestId]
      );
    }

    if (nextStatus === "Rejected") {
      await client.query(`DELETE FROM calendar_events WHERE borrow_request_id = $1`, [requestId]);
      if (request.status === "Pending") {
        await client.query(`UPDATE public.borrow_request_authorizations SET status='rejected',professor_user_id=$2,
          professor_name=$3,rejected_at=now(),rejection_reason=$4,updated_at=now() WHERE request_id=$1 AND status='awaiting'`,
          [requestId, req.user.id, req.user.full_name, String(req.body?.reason ?? "Request rejected during review.").slice(0, 500)]);
      }
    }

    await writeAuditLog(client, req.user, {
      action: "borrowing_status_changed",
      entityType: "borrowing_request",
      entityId: requestId,
      oldValues: { status: request.status },
      newValues: { status: nextStatus, serializedAssets: nextStatus === "Borrowed" ? scannedAssets.map((asset) => asset.asset_number) : [] },
    });
    await notifyUser(client, request.user_id, {
      type: `borrowing_${String(nextStatus).toLowerCase()}`,
      title: nextStatus === "Approved" ? "Borrowing request ready for claim" : `Borrowing request ${String(nextStatus).toLowerCase()}`,
      message: nextStatus === "Approved"
        ? `Your borrowing request BR-${String(requestId).padStart(3, "0")} is approved and ready for claim.`
        : `Your borrowing request BR-${String(requestId).padStart(3, "0")} is now ${String(nextStatus).toLowerCase()}.`,
      relatedPath: "/my-requests",
      entityType: "borrowing_request",
      entityId: requestId,
    });

    const receipt = nextStatus === "Borrowed"
      ? await createTransactionReceipt(client, { requestId, receiptType: "claim", createdBy: req.user.id })
      : null;

    if (receipt) {
      await writeAuditLog(client, req.user, {
        action: "transaction_receipt_created",
        entityType: "transaction_receipt",
        entityId: receipt.id,
        newValues: {
          receiptNumber: receipt.receipt_number,
          receiptType: "claim",
          requestId,
        },
      });
    }

    await client.query("COMMIT");
    return res.json({ request: updatedResult.rows[0], receipt });
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
  getAssignmentOptions,
  getBorrowingPolicy,
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
  validateClaimWindow,
  validateBorrowRequest,
  validateAcademicAssignment,
  withValidation,
};
