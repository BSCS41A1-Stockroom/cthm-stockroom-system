"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { inventoryErrors, normalizeInventory, normalizeUnavailability, unavailabilityErrors } = require("./inventoryController");

test("normalizes and validates authoritative inventory mutations", () => {
  const item = normalizeInventory({ item_name: " Pan ", purchase_date: "2026-08-01", quantity: "10", additional_qty: 2,
    replaces: 1, missing: 0, breakage: 0, defective: 0, total_loss: 0, low_stock_threshold: 2, remarks: " Good " });
  assert.equal(item.item_name, "Pan");
  assert.equal(item.quantity, 10);
  assert.equal(item.remarks, "Good");
  assert.deepEqual(inventoryErrors(item), []);
});

test("rejects inventory deductions that exceed physical stock", () => {
  const item = normalizeInventory({ item_name: "Pan", quantity: 1, missing: 2 });
  assert.ok(inventoryErrors(item).includes("Inventory deductions cannot exceed the total physical quantity."));
});

test("rejects inventory numbers outside PostgreSQL integer range", () => {
  const item = normalizeInventory({ item_name: "Pan", quantity: 2_147_483_648 });
  assert.ok(inventoryErrors(item).some((error) => error.includes("database-safe")));
});

test("normalizes inventory unavailability API fields", () => {
  assert.deepEqual(normalizeUnavailability({
    start_date: "2026-09-10",
    end_date: "2026-09-12",
    reason: " Maintenance ",
  }), {
    startDate: "2026-09-10",
    endDate: "2026-09-12",
    reason: "Maintenance",
  });
});

test("rejects invalid unavailability periods", () => {
  assert.deepEqual(unavailabilityErrors(normalizeUnavailability({
    startDate: "2026-09-12",
    endDate: "2026-09-10",
    reason: "",
  })), [
    "The end date cannot be before the start date.",
    "A reason is required.",
  ]);
});

test("accepts a valid same-day unavailability period", () => {
  assert.deepEqual(unavailabilityErrors(normalizeUnavailability({
    startDate: "2026-09-10",
    endDate: "2026-09-10",
    reason: "Inspection",
  })), []);
});
