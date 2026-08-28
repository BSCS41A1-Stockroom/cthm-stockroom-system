"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { writeAuditLog } = require("./auditLog");

test("writes a normalized audit record using parameterized values", async () => {
  let call;
  const client = { query: async (...args) => { call = args; } };
  await writeAuditLog(client, { id: "user-1", email: "admin@example.com", full_name: "Admin", role: "admin" }, {
    action: "calendar_created", entityType: "calendar_event", entityId: 9,
    newValues: { title: "Lab" },
  });
  assert.match(call[0], /INSERT INTO public\.audit_logs/);
  assert.deepEqual(call[1].slice(0, 7), ["user-1", "admin@example.com", "Admin", "admin", "calendar_created", "calendar_event", "9"]);
  assert.equal(call[1][8], JSON.stringify({ title: "Lab" }));
});

test("rejects incomplete audit entries", async () => {
  await assert.rejects(() => writeAuditLog({ query() {} }, {}, {}), /action, and entity type/);
});
