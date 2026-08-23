import test from "node:test";
import assert from "node:assert/strict";
import { inventoryStockStatus, inventoryTotals } from "./inventoryAvailability.js";

test("calculates available inventory from stock, adjustments, and commitments", () => {
  const totals = inventoryTotals({
    quantity: 20,
    additional_qty: 5,
    replaces: 2,
    missing: 1,
    breakage: 1,
    defective: 2,
    total_loss: 1,
    reserved_quantity: 3,
    borrowed_quantity: 4,
    low_stock_threshold: 10,
  });

  assert.deepEqual(totals, {
    total: 23,
    usable: 18,
    committed: 7,
    available: 11,
    rawAvailable: 11,
    threshold: 10,
  });
});

test("classifies low and unavailable inventory using the configured threshold", () => {
  assert.equal(inventoryStockStatus({ quantity: 5, low_stock_threshold: 5 }), "low-stock");
  assert.equal(inventoryStockStatus({ quantity: 5, reserved_quantity: 5 }), "out-of-stock");
  assert.equal(inventoryStockStatus({ quantity: 6, low_stock_threshold: 5 }), "in-stock");
});

test("never exposes a negative available quantity", () => {
  const totals = inventoryTotals({ quantity: 2, borrowed_quantity: 3 });
  assert.equal(totals.rawAvailable, -1);
  assert.equal(totals.available, 0);
});
