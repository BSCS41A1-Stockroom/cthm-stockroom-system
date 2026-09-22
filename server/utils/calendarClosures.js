"use strict";

const { isValidDate } = require("../algorithms/borrowingValidation");

function datesBetween(startDate, endDate) {
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate < startDate) return [];
  const dates = [];
  for (let current = Date.parse(`${startDate}T00:00:00Z`), end = Date.parse(`${endDate}T00:00:00Z`);
    current <= end && dates.length < 31; current += 86_400_000) {
    dates.push(new Date(current).toISOString().slice(0, 10));
  }
  return dates;
}

async function lockClosureDates(client, startDate, endDate) {
  for (const date of datesBetween(startDate, endDate)) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`calendar-closure:${date}`]);
  }
}

async function findClosure(client, dates, departmentId = null) {
  const uniqueDates = [...new Set(dates.filter(isValidDate))].sort();
  for (const date of uniqueDates) await lockClosureDates(client, date, date);
  if (!uniqueDates.length) return null;
  const result = await client.query(
    `SELECT id, title, start_date, end_date, source_kind
       FROM public.calendar_closures
      WHERE is_active=true
        AND EXISTS (SELECT 1 FROM unnest($1::date[]) AS selected(day)
                    WHERE selected.day BETWEEN start_date AND end_date)
        AND (department_id IS NULL OR department_id=$2::bigint)
      ORDER BY start_date, id LIMIT 1`,
    [uniqueDates, departmentId]
  );
  return result.rows[0] || null;
}

function suggestClosure(text) {
  const content = String(text || "").slice(0, 10000);
  const normalized = content.toLowerCase();
  const positive = /\bwalang\s+pasok\b|\bno\s+classes\b|\bclasses?\s+(?:are\s+)?suspended\b|\bclasses?\s+suspension\b|\bsuspens(?:yon|ion)\s+ng\s+klase\b/i.test(content);
  const negation = /\bmay\s+pasok\b|\bclasses?\s+will\s+resume\b|\bno\s+suspension\b/i.test(content);
  const year = normalized.match(/\b20\d{2}\b/)?.[0];
  const monthNames = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  const monthMatch = normalized.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?/);
  const dates = [];
  if (monthMatch && year) {
    const month = monthNames[monthMatch[1]];
    const first = Number(monthMatch[2]);
    const last = Number(monthMatch[3] || first);
    if (last >= first && last - first <= 30) {
      for (let day = first; day <= last; day++) {
        const candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        if (isValidDate(candidate)) dates.push(candidate);
      }
    }
  }
  return {
    possibleSuspension: positive && !negation,
    dates,
    needsReview: true,
    warnings: [
      ...(!positive || negation ? ["No unambiguous class-suspension phrase was found."] : []),
      ...(!dates.length ? ["Dates could not be confirmed; enter them manually."] : []),
      "Verify the school, campus, affected students, and dates against the original announcement.",
    ],
  };
}

module.exports = { datesBetween, lockClosureDates, findClosure, suggestClosure };
