"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../config/db");
const { submitAnnouncementReview, createClosure } = require("./closureController");

function response() {
  return { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("announcement drafts record suggestions without creating a closure", async () => {
  const oldConnect = pool.connect;
  let sql;
  pool.connect = async () => ({
    async query(statement, values) {
      if (statement.includes("INSERT INTO public.announcement_reviews")) {
        sql = statement;
        assert.equal(values[3], true);
        assert.equal(values[4], "2026-09-23");
        return { rowCount: 1, rows: [{ id: 5, status: "pending" }] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  });
  try {
    const res = response();
    await submitAnnouncementReview({ body: { caption: "WALANG PASOK September 23, 2026 due to typhoon", sourceUrl: "https://example.edu/post" }, user: { id: "admin" } }, res, (error) => { throw error; });
    assert.equal(res.statusCode, 201);
    assert.match(sql, /INSERT INTO public\.announcement_reviews/);
    assert.equal(res.body.review.status, "pending");
  } finally { pool.connect = oldConnect; }
});

test("a school announcement cannot block dates without a pending review", async () => {
  const res = response();
  await createClosure({ body: { title: "Suspended classes", startDate: "2026-09-23", sourceKind: "school_announcement" } }, res, (error) => { throw error; });
  assert.equal(res.statusCode, 422);
});

test("a partial-day announcement cannot be confirmed as a whole-day closure", async () => {
  const oldConnect = pool.connect;
  const statements = [];
  pool.connect = async () => ({
    async query(sql) {
      statements.push(sql);
      if (sql.includes("SELECT * FROM public.announcement_reviews")) return {
        rows: [{ id: 3, status: "pending", possible_suspension: true,
          caption: "All AFTERNOON onsite classes are SUSPENDED September 9, 2026",
          suspension_scope: "partial_day", source_url: "https://example.edu/post" }], rowCount: 1,
      };
      return { rows: [], rowCount: 0 };
    },
    release() {},
  });
  try {
    const res = response();
    await createClosure({ body: { title: "Afternoon suspension", startDate: "2026-09-09",
      sourceKind: "school_announcement", sourceUrl: "https://example.edu/post", reviewId: 3 },
    user: { id: "admin" } }, res, (error) => { throw error; });
    assert.equal(res.statusCode, 422);
    assert.equal(statements.includes("ROLLBACK"), true);
    assert.equal(statements.some((sql) => sql.includes("INSERT INTO public.calendar_closures")), false);
  } finally { pool.connect = oldConnect; }
});
