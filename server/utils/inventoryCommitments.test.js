"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadInventoryCommitment, usableInventoryQuantity } = require("./inventoryCommitments");

test("calculates usable physical inventory consistently", () => {
  assert.equal(usableInventoryQuantity({
    quantity: 10, additional_qty: 2, replaces: 1, missing: 1,
    breakage: 1, defective: 1, total_loss: 1,
  }), 7);
});

test("combines physically borrowed units with peak scheduled demand", async () => {
  const client = { query: async () => ({ rows: [{ borrowed: "3", scheduled_peak: "4", has_invalid_quantity: false }] }) };
  assert.deepEqual(await loadInventoryCommitment(client, 7), {
    borrowed: 3, scheduledPeak: 4, requiredCapacity: 7, valid: true,
  });
});

test("fails closed when commitment data is invalid", async () => {
  const client = { query: async () => ({ rows: [{ borrowed: "3", scheduled_peak: "4", has_invalid_quantity: true }] }) };
  assert.equal((await loadInventoryCommitment(client, 7)).valid, false);
});

test("commitment query detects returns exceeding the requested quantity", async () => {
  let statement = "";
  const client = { query: async (sql) => {
    statement = sql;
    return { rows: [{ borrowed: "0", scheduled_peak: "0", has_invalid_quantity: false }] };
  } };
  await loadInventoryCommitment(client, 7);
  assert.match(statement, /accounted > requested_quantity/);
});
