"use strict";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function availableQuantity(item) {
  return Number(item.quantity ?? 0)
    + Number(item.additional_qty ?? 0)
    - Number(item.replaces ?? 0)
    - Number(item.missing ?? 0)
    - Number(item.breakage ?? 0)
    - Number(item.defective ?? 0)
    - Number(item.total_loss ?? 0);
}

function validateBorrowingRequestShape(request) {
  const errors = [];
  const requestedItems = Array.isArray(request.items) ? request.items : [];

  if (typeof request.studentName !== "string" || !request.studentName.trim()) {
    errors.push({ code: "STUDENT_NAME_REQUIRED", message: "Student name is required." });
  }
  if (typeof request.studentId !== "string" || !request.studentId.trim()) {
    errors.push({ code: "STUDENT_ID_REQUIRED", message: "Student ID is required." });
  }

  if (!isValidDate(request.borrowDate)) errors.push({ code: "INVALID_BORROW_DATE", message: "Borrow date must be a valid YYYY-MM-DD date." });
  if (!isValidDate(request.returnDate)) errors.push({ code: "INVALID_RETURN_DATE", message: "Return date must be a valid YYYY-MM-DD date." });
  if (isValidDate(request.borrowDate) && isValidDate(request.returnDate) && request.returnDate < request.borrowDate) {
    errors.push({ code: "INVALID_DATE_RANGE", message: "Return date cannot be before the borrow date." });
  }
  if (typeof request.purpose !== "string" || !request.purpose.trim()) {
    errors.push({ code: "PURPOSE_REQUIRED", message: "Purpose is required." });
  }
  if (requestedItems.length === 0) errors.push({ code: "ITEMS_REQUIRED", message: "At least one inventory item is required." });

  const seen = new Set();
  for (const requested of requestedItems) {
    const inventoryId = String(requested.inventoryId ?? "");
    if (!inventoryId || seen.has(inventoryId)) {
      errors.push({
        code: seen.has(inventoryId) ? "DUPLICATE_ITEM" : "INVALID_ITEM",
        inventoryId: inventoryId || undefined,
        message: seen.has(inventoryId) ? `Inventory item '${inventoryId}' appears more than once.` : "Each item requires an inventoryId.",
      });
      continue;
    }
    seen.add(inventoryId);

    if (!Number.isInteger(requested.quantity) || requested.quantity <= 0) {
      errors.push({ code: "INVALID_QUANTITY", inventoryId, message: `Quantity for inventory item '${inventoryId}' must be a positive integer.` });
    }
  }

  return errors;
}

function normalizeBorrowingInput(input) {
  const request = input?.request ?? {};
  const requestedItems = Array.isArray(request.items) ? request.items : [];
  const inventory = Array.isArray(input?.inventory) ? input.inventory : [];
  const existingBorrowings = Array.isArray(input?.existingBorrowings) ? input.existingBorrowings : [];
  const errors = validateBorrowingRequestShape(request);
  const inventoryById = new Map(inventory.map((item) => [String(item.id), item]));
  const seen = new Set();
  const items = [];

  for (const requested of requestedItems) {
    const inventoryId = String(requested.inventoryId ?? "");
    if (!inventoryId || seen.has(inventoryId) || !Number.isInteger(requested.quantity) || requested.quantity <= 0) continue;
    seen.add(inventoryId);

    const item = inventoryById.get(inventoryId);
    if (!item) {
      errors.push({ code: "ITEM_NOT_FOUND", inventoryId, message: `Inventory item '${inventoryId}' does not exist.` });
      continue;
    }

    const reserved = existingBorrowings
      .filter((entry) => String(entry.inventoryId) === inventoryId)
      .reduce((sum, entry) => sum + Number(entry.quantity ?? 0), 0);

    items.push({
      inventoryId,
      itemName: item.item_name ?? item.itemName ?? inventoryId,
      requestedQuantity: requested.quantity,
      physicalQuantity: Math.max(0, availableQuantity(item)),
      reservedQuantity: Math.max(0, reserved),
    });
  }

  return { request, items, errors };
}

/**
 * Builds the borrowing CSP.
 *
 * Variable Q_item represents the number of units allocated to one requested
 * inventory item. Its domain is 0..min(requested, physically available).
 * A complete valid assignment must allocate the exact requested quantity and
 * must not exceed capacity after overlapping reservations are deducted.
 */
function createBorrowingCspModel(input) {
  const normalized = normalizeBorrowingInput(input);
  const variables = normalized.items.map((item) => ({
    id: `quantity:${item.inventoryId}`,
    inventoryId: item.inventoryId,
  }));
  const itemByVariable = new Map(variables.map((variable, index) => [variable.id, normalized.items[index]]));
  const domains = Object.fromEntries(variables.map((variable) => {
    const item = itemByVariable.get(variable.id);
    const maximum = Math.min(item.requestedQuantity, item.physicalQuantity);
    return [variable.id, Object.freeze(Array.from({ length: maximum + 1 }, (_, quantity) => quantity))];
  }));

  const constraints = [
    {
      id: "exact_requested_quantity",
      description: "Every selected inventory item must receive its full requested quantity.",
      isSatisfied(assignment) {
        return variables.every((variable) => {
          if (!Object.hasOwn(assignment, variable.id)) return true;
          return assignment[variable.id] === itemByVariable.get(variable.id).requestedQuantity;
        });
      },
    },
    {
      id: "inventory_capacity",
      description: "Allocated plus reserved units cannot exceed usable physical inventory.",
      isSatisfied(assignment) {
        return variables.every((variable) => {
          if (!Object.hasOwn(assignment, variable.id)) return true;
          const item = itemByVariable.get(variable.id);
          return assignment[variable.id] + item.reservedQuantity <= item.physicalQuantity;
        });
      },
    },
    {
      id: "domain_membership",
      description: "Every allocation must be a value in its generated domain.",
      isSatisfied(assignment) {
        return variables.every((variable) =>
          !Object.hasOwn(assignment, variable.id) || domains[variable.id].includes(assignment[variable.id])
        );
      },
    },
  ];

  return Object.freeze({
    variables: Object.freeze(variables),
    domains: Object.freeze(domains),
    constraints: Object.freeze(constraints),
    normalized,
  });
}

function validateBorrowingRequest(input) {
  const model = createBorrowingCspModel(input);
  const reasons = [...model.normalized.errors];
  const assignment = {};

  for (const variable of model.variables) {
    const item = model.normalized.items.find((entry) => entry.inventoryId === variable.inventoryId);
    assignment[variable.id] = item.requestedQuantity;

    const remainingQuantity = Math.max(0, item.physicalQuantity - item.reservedQuantity);
    if (item.requestedQuantity > remainingQuantity) {
      reasons.push({
        code: "INSUFFICIENT_INVENTORY",
        inventoryId: item.inventoryId,
        requestedQuantity: item.requestedQuantity,
        availableQuantity: remainingQuantity,
        message: `${item.itemName} only has ${remainingQuantity} unit(s) available for the selected dates.`,
      });
    }
  }

  const constraintsSatisfied = model.constraints.every((constraint) => constraint.isSatisfied(assignment));
  const valid = reasons.length === 0 && constraintsSatisfied && model.variables.length > 0;

  return Object.freeze({
    valid,
    status: valid ? "Validated" : "Rejected",
    reasons: Object.freeze(reasons),
    assignment: valid ? Object.freeze(assignment) : null,
    checkedConstraints: Object.freeze(model.constraints.map((constraint) => constraint.id)),
  });
}

module.exports = {
  availableQuantity,
  createBorrowingCspModel,
  isValidDate,
  validateBorrowingRequestShape,
  validateBorrowingRequest,
};
