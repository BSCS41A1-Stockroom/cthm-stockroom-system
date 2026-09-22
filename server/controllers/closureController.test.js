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
