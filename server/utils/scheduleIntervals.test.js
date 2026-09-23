"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { scheduleBounds, schedulesOverlap } = require("./scheduleIntervals");

test("half-open intervals let a morning booking end when an afternoon closure begins", () => {
  const morning = { borrowDate: "2026-09-09", returnDate: "2026-09-09", startTime: "08:00", endTime: "12:00" };
  const afternoon = { startDate: "2026-09-09", endDate: "2026-09-09", startTime: "12:00", endTime: "18:00" };
  assert.equal(schedulesOverlap(morning, afternoon), false);
  assert.equal(schedulesOverlap({ ...morning, endTime: "13:00" }, afternoon), true);
});

test("legacy date-only requests cover full dates and multi-day timed requests cross midnight", () => {
  const closure = { startDate: "2026-09-10", endDate: "2026-09-10" };
  assert.equal(schedulesOverlap({ borrowDate: "2026-09-09", returnDate: "2026-09-10" }, closure), true);
  assert.equal(schedulesOverlap({ borrowDate: "2026-09-09", returnDate: "2026-09-10", startTime: "15:00", endTime: "08:00" }, closure), true);
  assert.deepEqual(scheduleBounds({ borrowDate: "2026-09-10", returnDate: "2026-09-10", startTime: "14:00", endTime: "13:00" }), null);
});
