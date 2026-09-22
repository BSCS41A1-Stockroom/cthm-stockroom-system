"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { datesBetween, findClosure, suggestClosure } = require("./calendarClosures");

test("recognizes a dated walang pasok announcement but still requires review", () => {
  const result = suggestClosure("WALANG PASOK: September 23-24, 2026 due to typhoon.");
  assert.equal(result.possibleSuspension, true);
  assert.deepEqual(result.dates, ["2026-09-23", "2026-09-24"]);
  assert.equal(result.needsReview, true);
});

test("does not treat may pasok or undated posts as confirmed closures", () => {
  assert.equal(suggestClosure("May pasok sa September 23, 2026").possibleSuspension, false);
  assert.deepEqual(suggestClosure("Walang pasok bukas").dates, []);
});

test("rejects invalid calendar dates and limits closure spans", () => {
  assert.deepEqual(datesBetween("2026-02-30", "2026-03-01"), []);
  assert.deepEqual(datesBetween("2026-09-23", "2026-09-24"), ["2026-09-23", "2026-09-24"]);
  assert.equal(datesBetween("2026-01-01", "2026-12-31").length, 31);
});

test("checks only the selected borrow and return dates", async () => {
  const calls = [];
  const client = { query: async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [], rowCount: 0 };
  } };
  assert.equal(await findClosure(client, ["2026-09-23", "2026-09-25"], 2), null);
  assert.equal(calls.length, 3);
  assert.match(calls[2].sql, /unnest\(\$1::date\[\]\)/);
  assert.deepEqual(calls[2].values, [["2026-09-23", "2026-09-25"], 2]);
});
