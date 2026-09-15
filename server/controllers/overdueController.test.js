"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { authorizedCronRequest, processExpiredClaims, processUpcomingDeadlines, processOverdueBorrowings } = require("./overdueController");

test("expires stale ready requests and releases every reservation atomically", async () => {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ acquired: true }] };
      if (sql.includes("WHERE status='Approved'")) return { rowCount: 1, rows: [{ id: 8, user_id: "student-user" }] };
      if (sql.includes("FROM public.borrow_request_items")) return { rowCount: 2, rows: [{ inventory_id: 2, quantity: 3 }, { inventory_id: 4, quantity: 1 }] };
      if (sql.includes("UPDATE public.inventory")) return { rowCount: 1, rows: [{ id: values[1] }] };
      if (sql.includes("INSERT INTO public.notifications")) return { rowCount: 1, rows: [{ id: 10 }] };
      return { rowCount: 1, rows: [] };
    },
    release() { calls.push({ sql: "RELEASE" }); },
  };
  assert.deepEqual(await processExpiredClaims({ connect: async () => client }), {
    processed: 1, notificationsCreated: 1, skipped: false,
  });
  assert.equal(calls.filter((call) => call.sql.includes("UPDATE public.inventory")).length, 2);
  assert.ok(calls.some((call) => call.sql.includes("SET status='Expired'")));
  assert.ok(calls.some((call) => call.values?.includes("borrowing_claim_expired")));
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
});

test("creates one early warning per due-date threshold and only for outstanding borrowed items", async () => {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ acquired: true }] };
      if (sql.includes("JOIN public.calendar_events due")) return { rowCount: 1, rows: [{
        id: 12, user_id: "student-user", due_date: "2026-09-16", days_remaining: 3, units_outstanding: 2,
      }] };
      if (sql.includes("INSERT INTO public.notifications")) return { rowCount: 1, rows: [{ id: 1 }] };
      return { rows: [], rowCount: 0 };
    },
    release() { calls.push({ sql: "RELEASE" }); },
  };

  assert.deepEqual(await processUpcomingDeadlines({ connect: async () => client }), {
    processed: 1, notificationsCreated: 1, skipped: false,
  });
  const reminder = calls.find((call) => call.sql.includes("INSERT INTO public.notifications"));
  assert.match(reminder.sql, /ON CONFLICT \(notification_key\).*DO NOTHING/s);
  assert.equal(reminder.values[4], "return-due:12:2026-09-16:3:student-user");
  assert.match(reminder.values[2], /2 unit\(s\) remain outstanding/);
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
});

test("skips deadline reminders when another run holds the lock", async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ acquired: false }] };
      return { rows: [], rowCount: 0 };
    },
    release() { calls.push("RELEASE"); },
  };
  assert.deepEqual(await processUpcomingDeadlines({ connect: async () => client }), {
    processed: 0, notificationsCreated: 0, skipped: true,
  });
  assert.ok(calls.includes("ROLLBACK"));
  assert.equal(calls.some((sql) => sql.includes("JOIN public.calendar_events due")), false);
});

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
