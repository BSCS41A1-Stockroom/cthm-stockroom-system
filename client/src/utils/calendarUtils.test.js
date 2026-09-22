import test from "node:test";
import assert from "node:assert/strict";
import { getUpcomingEvents } from "./calendarUtils.js";

test("upcoming events exclude past dates and list the nearest events first", () => {
  const events = [
    { id: 1, date: "2026-01-01" },
    { id: 2, date: "2027-01-01" },
    { id: 3, date: "2026-09-23", start: "14:00" },
    { id: 4, date: "2026-09-22" },
    { id: 5, date: "2026-09-23", start: "09:00" },
  ];
  assert.deepEqual(
    getUpcomingEvents(events, new Date(2026, 8, 22), 3).map((event) => event.id),
    [4, 5, 3]
  );
  assert.equal(events[0].id, 1);
});
