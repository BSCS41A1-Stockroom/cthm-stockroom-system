"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../config/db");
const { normalizeReportRange, reportSummary } = require("./reportController");

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

test("dashboard pending count is current and not limited by the selected borrow-date range", async () => {
  const originalQuery = pool.query;
  let summarySql = "";
  pool.query = async (sql) => {
    if (sql.includes("WITH ranged_requests")) { summarySql = sql; return { rows: [{ pending_requests: "2" }] }; }
    return { rows: [] };
  };
  const res = { json(body) { this.body = body; return this; } };
  try { await reportSummary({ query: { from: "2026-09-01", to: "2026-09-30" } }, res, (error) => { throw error; }); }
  finally { pool.query = originalQuery; }
  assert.match(summarySql, /SELECT COUNT\(\*\) FROM public\.borrow_requests WHERE status IN \('Pending', 'Validated'\)/);
  assert.equal(res.body.summary.pending_requests, 2);
});
