"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { basicEventErrors, normalizeEvent } = require("./calendarController");

test("normalizes calendar API and database field names", () => {
  assert.deepEqual(normalizeEvent({
    title: " Kitchen Lab ",
    event_date: "2026-08-10",
    start_time: "09:00:00",
    end_time: "10:00:00",
    event_type: "activity",
    room_id: 2,
    description: " Test ",
  }), {
    title: "Kitchen Lab",
    date: "2026-08-10",
    start: "09:00:00",
    end: "10:00:00",
    type: "activity",
    roomId: 2,
    description: "Test",
  });
});

test("rejects incomplete and invalid calendar events", () => {
  assert.deepEqual(basicEventErrors(normalizeEvent({})), [
    "Event title is required.",
    "A valid event date is required.",
  ]);
  assert.deepEqual(basicEventErrors(normalizeEvent({
    title: "Lab",
    date: "2026-08-10",
    start: "10:00",
    end: "09:00",
    roomId: 1,
  })), ["End time must be after start time."]);
});
