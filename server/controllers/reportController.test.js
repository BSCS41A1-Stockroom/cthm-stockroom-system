"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeReportRange } = require("./reportController");

test("defaults reports to the current year through today", () => {
  assert.deepEqual(normalizeReportRange({}, new Date("2026-08-28T10:00:00Z")), {
    from: "2026-01-01",
    to: "2026-08-28",
    errors: [],
  });
});

test("rejects reversed and excessively large report ranges", () => {
  assert.deepEqual(normalizeReportRange({ from: "2026-09-01", to: "2026-08-01" }).errors, [
    "The from date cannot be after the to date.",
  ]);
  assert.deepEqual(normalizeReportRange({ from: "2020-01-01", to: "2026-01-02" }).errors, [
    "The report range cannot exceed five years.",
  ]);
});

test("rejects calendar-shaped report dates that do not exist", () => {
  assert.deepEqual(normalizeReportRange({ from: "2026-02-30", to: "2026-08-01" }).errors, [
    "A valid from date is required.",
  ]);
});
