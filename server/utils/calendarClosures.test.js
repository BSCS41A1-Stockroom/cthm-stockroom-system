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

test("classifies an afternoon-only LOA notice as partial, not a whole-day block", () => {
  const result = suggestClosure(`📢 ANNOUNCEMENT | SEPTEMBER 9, 2026
    Due to the prevailing inclement weather, all AFTERNOON onsite classes and school activities are SUSPENDED today, September 9, 2026.
    Students are advised to stay safe. Offices may remain open.`);
  assert.equal(result.possibleSuspension, true);
  assert.equal(result.scope, "partial_day");
  assert.deepEqual(result.dates, ["2026-09-09"]);
  assert.match(result.evidence.suspensionPhrase, /suspended/i);
  assert.match(result.warnings.join(" "), /cannot|do not confirm/i);
});

test("classifies a full-day onsite suspension even when offices stay open", () => {
  const result = suggestClosure(`📢 ANNOUNCEMENT | SEPTEMBER 10, 2026
    Due to rainfall, all onsite classes and activities are SUSPENDED today, September 10, 2026 (Thursday).
    The following offices will remain OPEN today: Registrar's Office, Finance Office.`);
  assert.equal(result.possibleSuspension, true);
  assert.equal(result.scope, "full_day");
  assert.deepEqual(result.dates, ["2026-09-10"]);
  assert.equal(result.evidence.datePhrase.toLowerCase(), "september 10, 2026");
});

test("does not classify a dated cultural event as a suspension", () => {
  const result = suggestClosure(`PAMANA: A celebration of Filipino culture. This September 23, 2026,
    the Lyceum of Alabang presents a Cultural Show. First Show: 12:30 PM. Second Show: 3:30 PM.`);
  assert.equal(result.possibleSuspension, false);
  assert.equal(result.scope, "none");
  assert.deepEqual(result.dates, []);
});

test("recognizes Filipino month names and ranges but does not guess ambiguous numeric dates", () => {
  assert.deepEqual(suggestClosure("WALANG PASOK Setyembre 9-10, 2026").dates, ["2026-09-09", "2026-09-10"]);
  assert.deepEqual(suggestClosure("Walang pasok 9 ng Setyembre 2026").dates, ["2026-09-09"]);
  assert.deepEqual(suggestClosure("Walang pasok 09/10/2026").dates, []);
  assert.match(suggestClosure("Walang pasok 09/10/2026").warnings.join(" "), /ambiguous|numeric/i);
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
