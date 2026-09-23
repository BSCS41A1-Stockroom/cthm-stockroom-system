"use strict";

const { isValidDate } = require("../algorithms/borrowingValidation");

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(?:\:00)?$/;

function validTime(value) {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

function nextDate(date) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

function scheduleBounds(schedule) {
  const startDate = schedule.borrowDate ?? schedule.borrow_date ?? schedule.startDate ?? schedule.start_date;
  const endDate = schedule.returnDate ?? schedule.return_date ?? schedule.endDate ?? schedule.end_date;
  const startTime = schedule.startTime ?? schedule.start_time ?? null;
  const endTime = schedule.endTime ?? schedule.end_time ?? null;
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate < startDate) return null;
  if ((startTime == null) !== (endTime == null)) return null;
  if (startTime != null && (!validTime(startTime) || !validTime(endTime))) return null;
  const start = `${startDate}T${startTime ? startTime.slice(0, 5) : "00:00"}`;
  const end = endTime ? `${endDate}T${endTime.slice(0, 5)}` : `${nextDate(endDate)}T00:00`;
  return start < end ? { start, end } : null;
}

function schedulesOverlap(left, right) {
  const a = scheduleBounds(left);
  const b = scheduleBounds(right);
  return Boolean(a && b && a.start < b.end && b.start < a.end);
}

module.exports = { validTime, scheduleBounds, schedulesOverlap };
