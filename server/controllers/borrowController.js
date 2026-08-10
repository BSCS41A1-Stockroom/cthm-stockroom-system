"use strict";

const pool = require("../config/db");
const {
  validateBorrowingRequest,
  validateBorrowingRequestShape,
} = require("../algorithms/borrowingValidation");

const ACTIVE_STATUSES = ["Pending", "Validated", "Approved", "Borrowed"];

function normalizeRequest(body) {
  return {
    borrowDate: body.borrowDate ?? body.borrow_date,
    returnDate: body.returnDate ?? body.return_date,
    purpose: body.purpose,
    items: Array.isArray(body.items) ? body.items.map((item) => ({
      inventoryId: item.inventoryId ?? item.inventory_id,
      quantity: Number(item.quantity),
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
      `INSERT INTO borrow_requests (borrow_date, return_date, purpose, status)
       VALUES ($1::date, $2::date, $3, $4)
       RETURNING *`,
      [request.borrowDate, request.returnDate, request.purpose.trim(), "Pending"]
    );
    const savedRequest = requestResult.rows[0];

    for (const item of request.items) {
      await client.query(
        `INSERT INTO borrow_request_items (request_id, inventory_id, quantity)
         VALUES ($1, $2, $3)`,
        [savedRequest.id, item.inventoryId, item.quantity]
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

module.exports = {
  createBorrowRequest,
  loadValidationContext,
  normalizeRequest,
  validateBorrowRequest,
};
