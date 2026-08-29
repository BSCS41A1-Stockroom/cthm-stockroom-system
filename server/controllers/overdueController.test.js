"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { authorizedCronRequest, processOverdueBorrowings } = require("./overdueController");

test("accepts only an exact bearer cron secret", () => {
  assert.equal(authorizedCronRequest("Bearer correct-secret", "correct-secret"), true);
  assert.equal(authorizedCronRequest("Bearer wrong-secret", "correct-secret"), false);
  assert.equal(authorizedCronRequest("correct-secret", "correct-secret"), false);
  assert.equal(authorizedCronRequest("Bearer correct-secret", ""), false);
});

test("skips safely when another overdue job owns the advisory lock", async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ acquired: false }] };
      return { rows: [], rowCount: 0 };
    },
    release() { calls.push("RELEASE"); },
  };
  const result = await processOverdueBorrowings({ connect: async () => client });
  assert.deepEqual(result, { processed: 0, notificationsCreated: 0, skipped: true });
  assert.ok(calls.includes("ROLLBACK"));
  assert.ok(calls.includes("RELEASE"));
});

test("creates daily student and staff overdue notices and audits first detection", async () => {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ acquired: true }] };
      if (sql.includes("FROM public.borrow_requests request")) {
        return { rowCount: 1, rows: [{
          id: 12,
          user_id: "00000000-0000-4000-8000-000000000001",
          student_name: "Student One",
          return_date: "2026-08-27",
          overdue_detected_at: null,
          days_overdue: 2,
          notification_date: "2026-08-29",
        }] };
      }
      if (sql.includes("VALUES ($1, 'borrowing_overdue'")) return { rowCount: 1, rows: [{ id: 1 }] };
      if (sql.includes("SELECT profile.user_id, 'borrowing_overdue'")) return { rowCount: 2, rows: [{ id: 2 }, { id: 3 }] };
      return { rowCount: 1, rows: [] };
    },
    release() { calls.push({ sql: "RELEASE" }); },
  };

  const result = await processOverdueBorrowings({ connect: async () => client });
  assert.deepEqual(result, { processed: 1, notificationsCreated: 3, skipped: false });
  assert.ok(calls.some((call) => call.values?.includes("borrowing_overdue_detected")));
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
  assert.ok(calls.some((call) => call.sql === "RELEASE"));
});

test("rolls back and releases the database client when processing fails", async () => {
  const calls = [];
  const expected = new Error("database unavailable");
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ acquired: true }] };
      if (sql.includes("FROM public.borrow_requests request")) throw expected;
      return { rows: [], rowCount: 0 };
    },
    release() { calls.push("RELEASE"); },
  };

  await assert.rejects(processOverdueBorrowings({ connect: async () => client }), expected);
  assert.ok(calls.includes("ROLLBACK"));
  assert.ok(calls.includes("RELEASE"));
});
