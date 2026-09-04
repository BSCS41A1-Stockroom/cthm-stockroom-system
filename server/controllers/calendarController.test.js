"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { basicEventErrors, normalizeEvent, validateRoomSchedule } = require("./calendarController");

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
    date: "2099-08-10",
    start: "10:00",
    end: "09:00",
    roomId: 1,
  })), ["End time must be after start time."]);
});

test("rejects calendar-shaped dates that do not exist", () => {
  assert.deepEqual(basicEventErrors(normalizeEvent({
    title: "Lab",
    date: "2026-02-30",
  })), ["A valid event date is required."]);
});

test("rejects calendar events scheduled before the Manila business date", () => {
  assert.deepEqual(basicEventErrors(normalizeEvent({
    title: "Old laboratory activity",
    date: "2026-08-09",
  }), new Date("2026-08-09T16:30:00Z")), [
    "Calendar events cannot be scheduled in the past.",
  ]);
});

test("serializes room conflict checks by room and date", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes("FROM laboratory_rooms")) {
        return { rowCount: 1, rows: [{ id: 2, room_type: "kitchen", capacity: 30, features: {} }] };
      }
      if (sql.includes("FROM calendar_events")) return { rows: [] };
      return { rows: [] };
    },
  };

  const errors = await validateRoomSchedule(client, normalizeEvent({
    title: "Lab",
    date: "2099-08-10",
    start: "09:00",
    end: "10:00",
    roomId: 2,
  }));

  assert.deepEqual(errors, []);
  assert.match(calls[0].sql, /pg_advisory_xact_lock/);
  assert.equal(calls[0].params[0], "calendar-room:2:2099-08-10");
});
