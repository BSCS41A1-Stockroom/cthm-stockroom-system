"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  availableQuantity,
  createBorrowingCspModel,
  validateBorrowingRequest,
} = require("./borrowingValidation");

function validInput() {
  return {
    request: {
      studentName: "Juan Dela Cruz",
      studentId: "2026-0001",
      borrowDate: "2026-08-10",
      returnDate: "2026-08-12",
      purpose: "Culinary laboratory exercise",
      items: [{ inventoryId: 1, quantity: 3 }],
    },
    inventory: [{
      id: 1,
      item_name: "Mixing Bowl",
      quantity: 10,
      additional_qty: 2,
      replaces: 1,
      missing: 1,
      breakage: 1,
      defective: 0,
      total_loss: 0,
    }],
    existingBorrowings: [],
  };
}

test("calculates usable physical inventory from all stock adjustments", () => {
  assert.equal(availableQuantity(validInput().inventory[0]), 9);
});

test("builds quantity variables, domains, and CSP constraints", () => {
  const model = createBorrowingCspModel(validInput());

  assert.deepEqual(model.variables, [{ id: "quantity:1", inventoryId: "1" }]);
  assert.deepEqual(model.domains["quantity:1"], [0, 1, 2, 3]);
  assert.deepEqual(model.constraints.map((constraint) => constraint.id), [
    "exact_requested_quantity",
    "inventory_capacity",
    "domain_membership",
  ]);
});

test("validates a request when all requested quantities can be allocated", () => {
  const result = validateBorrowingRequest(validInput());

  assert.equal(result.valid, true);
  assert.equal(result.status, "Validated");
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.assignment, { "quantity:1": 3 });
});

test("rejects a request when overlapping reservations reduce availability", () => {
  const input = validInput();
  input.request.items[0].quantity = 5;
  input.existingBorrowings = [{ inventoryId: 1, quantity: 5 }];
  const result = validateBorrowingRequest(input);

  assert.equal(result.valid, false);
  assert.equal(result.status, "Rejected");
  assert.equal(result.reasons[0].code, "INSUFFICIENT_INVENTORY");
  assert.equal(result.reasons[0].availableQuantity, 4);
});

test("rejects malformed requests before processing", () => {
  const input = validInput();
  input.request.borrowDate = "2026-02-30";
  input.request.returnDate = "2026-01-01";
  input.request.purpose = " ";
  input.request.studentName = "";
  input.request.studentId = "";
  input.request.items = [];
  const result = validateBorrowingRequest(input);

  assert.equal(result.valid, false);
  assert.deepEqual(result.reasons.map((reason) => reason.code), [
    "STUDENT_NAME_REQUIRED",
    "STUDENT_ID_REQUIRED",
    "INVALID_BORROW_DATE",
    "PURPOSE_REQUIRED",
    "ITEMS_REQUIRED",
  ]);
});

test("rejects duplicate, missing, and invalid item quantities", () => {
  const input = validInput();
  input.request.items = [
    { inventoryId: 1, quantity: 1 },
    { inventoryId: 1, quantity: 1 },
    { inventoryId: 99, quantity: 1 },
    { inventoryId: 2, quantity: 0 },
  ];
  const result = validateBorrowingRequest(input);

  assert.equal(result.valid, false);
  assert.deepEqual(result.reasons.map((reason) => reason.code).sort(), [
    "DUPLICATE_ITEM",
    "INVALID_QUANTITY",
    "ITEM_NOT_FOUND",
  ].sort());
});
