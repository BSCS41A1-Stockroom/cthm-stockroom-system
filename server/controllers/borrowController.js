"use strict";

const pool = require("../config/db");
const {
  validateBorrowingRequest,
  validateBorrowingRequestShape,
} = require("../algorithms/borrowingValidation");

const ACTIVE_STATUSES = ["Pending", "Validated", "Approved", "Borrowed"];
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

async function loadValidationContext(client, request) {
  const inventoryIds = [...new Set(request.items.map((item) => String(item.inventoryId)).filter(Boolean))];
  if (inventoryIds.length === 0) return { inventory: [], existingBorrowings: [] };

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
    `SELECT bri.inventory_id, COALESCE(SUM(bri.quantity), 0)::integer AS quantity
       FROM borrow_request_items bri
       JOIN borrow_requests br ON br.id = bri.request_id
      WHERE bri.inventory_id::text = ANY($1::text[])
        AND br.status = ANY($2::text[])
        AND br.borrow_date <= $3::date
        AND br.return_date >= $4::date
      GROUP BY bri.inventory_id`,
    [inventoryIds, ACTIVE_STATUSES, request.returnDate, request.borrowDate]
  );

  return {
    inventory: inventoryResult.rows,
    existingBorrowings: reservationsResult.rows.map((row) => ({
      inventoryId: row.inventory_id,
      quantity: Number(row.quantity),
    })),
  };
}

async function withValidation(body, persist) {
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

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const context = await loadValidationContext(client, request);
    const validation = validateBorrowingRequest({ request, ...context });

    if (!validation.valid || !persist) {
      await client.query("ROLLBACK");
      return { request, validation };
    }

    const requestResult = await client.query(
      `INSERT INTO borrow_requests (student_name, student_id, borrow_date, return_date, purpose, status)
       VALUES ($1, $2, $3::date, $4::date, $5, $6)
       RETURNING *`,
      [
        request.studentName.trim(),
        request.studentId.trim(),
        request.borrowDate,
        request.returnDate,
        request.purpose.trim(),
        "Pending",
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
    const result = await withValidation(req.body, false);
    return res.status(result.validation.valid ? 200 : 422).json(result);
  } catch (error) {
    return next(error);
  }
}

async function createBorrowRequest(req, res, next) {
  try {
    const result = await withValidation(req.body, true);
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
  createBorrowRequest,
  inventoryDeltas,
  loadValidationContext,
  normalizeRequest,
  updateBorrowRequestStatus,
  validateBorrowRequest,
};
