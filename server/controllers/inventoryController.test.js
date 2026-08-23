"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeUnavailability, unavailabilityErrors } = require("./inventoryController");

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
