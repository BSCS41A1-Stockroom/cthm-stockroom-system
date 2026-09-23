import test from "node:test";
import assert from "node:assert/strict";
import { closureForSchedule } from "./closureEvents.js";

const afternoonClosure = [{
  id: 1, title: "Afternoon suspension", start_date: "2026-09-09", end_date: "2026-09-09",
  start_time: "12:00:00", end_time: "18:00:00", department_id: null,
}];

test("partial-day closure preview allows morning and blocks overlapping afternoon schedules", () => {
  assert.equal(closureForSchedule(afternoonClosure, "2026-09-09", "2026-09-09", "08:00", "12:00", 2), null);
  assert.equal(closureForSchedule(afternoonClosure, "2026-09-09", "2026-09-09", "11:00", "13:00", 2)?.id, 1);
});

test("date-only requests are treated as whole-day schedules", () => {
  assert.equal(closureForSchedule(afternoonClosure, "2026-09-09", "2026-09-09", "", "", 2)?.id, 1);
});
