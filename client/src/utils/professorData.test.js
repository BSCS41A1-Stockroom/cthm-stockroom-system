import test from "node:test";
import assert from "node:assert/strict";
import { dateInTimeZone, mapProfessorData, timeLabel } from "./professorData.js";

test("joins calendar events to their live borrowing request", () => {
  const result = mapProfessorData([{ id: 9, event_date: "2026-09-20", start_time: "09:00:00", end_time: "11:00:00", borrow_request_id: 4, room_name: "Lab 1", title: "Borrowing" }],
    [{ id: 4, status: "approved", authorizationStatus: "authorized", studentName: "Ana Cruz", studentId: "S-1", purpose: "Practical", items: [{ inventoryId: 2, name: "Plate", quantity: 3 }] }]);
  assert.equal(result.events[0].student, "Ana Cruz");
  assert.equal(result.events[0].items[0].quantity, 3);
  assert.equal(result.events[0].room, "Lab 1");
});

test("counts only awaiting pending requests for professor review", () => {
  const result = mapProfessorData([], [
    { id: 1, status: "pending", authorizationStatus: "awaiting" },
    { id: 2, status: "validated", authorizationStatus: "authorized" },
    { id: 3, status: "pending", authorizationStatus: "rejected" },
  ]);
  assert.deepEqual(result.pending.map((request) => request.id), [1]);
  assert.equal(timeLabel("13:05:00"), "1:05 PM");
  assert.equal(timeLabel(null), "All day");
  assert.equal(dateInTimeZone(new Date("2026-09-18T16:30:00.000Z")), "2026-09-19");
});
