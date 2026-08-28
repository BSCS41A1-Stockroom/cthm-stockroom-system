"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeAuditFilters } = require("./auditController");

test("normalizes and bounds audit filters", () => {
  assert.deepEqual(normalizeAuditFilters({ page: "2", action: "request_approved", entityType: "borrowing_request", search: "  Jay  " }), {
    page: 2, action: "request_approved", entityType: "borrowing_request", search: "Jay",
  });
  assert.equal(normalizeAuditFilters({ page: "-5", action: "invalid value" }).page, 1);
  assert.equal(normalizeAuditFilters({ action: "invalid value" }).action, "");
});
