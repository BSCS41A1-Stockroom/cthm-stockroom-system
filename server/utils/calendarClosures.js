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

const MONTHS = {
  january: 1, enero: 1, february: 2, pebrero: 2, march: 3, marso: 3,
  april: 4, abril: 4, may: 5, mayo: 5, june: 6, hunyo: 6,
  july: 7, hulyo: 7, august: 8, agosto: 8, september: 9, sept: 9,
  setyembre: 9, october: 10, oktubre: 10, november: 11, nobyembre: 11,
  december: 12, disyembre: 12,
};
const MONTH_PATTERN = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const SUSPENSION_PATTERN = /\bwalang\s+(?:pasok|klase)\b|\bno\s+classes\b|\b(?:onsite\s+)?classes?(?:\s+and\s+(?:school\s+)?activities)?\s+(?:are\s+|will\s+be\s+)?suspended\b|\bclass(?:es)?\s+suspension\b|\bsuspension\s+of\s+(?:onsite\s+)?classes\b|\bsuspens(?:yon|ion)\s+ng\s+klase\b|\bsuspendido\s+ang\s+(?:mga\s+)?klase\b/i;

function suggestClosure(text) {
  const content = String(text || "").slice(0, 10000).normalize("NFKC");
  const suspension = SUSPENSION_PATTERN.exec(content);
  const negation = /\bmay\s+pasok\b|\bclasses?\s+(?:will\s+)?resume\b|\bno\s+suspension\b|\bnot\s+suspended\b/i.test(content);
  const positive = Boolean(suspension) && !negation;
  const nearby = suspension ? content.slice(Math.max(0, suspension.index - 90), suspension.index + suspension[0].length + 90) : "";
  const partial = positive && /\b(?:morning|afternoon|evening|half[ -]?day|umaga|hapon|gabi)\b|\b(?:from|after|starting)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(nearby);
  const candidates = [];
  const addCandidate = (match, month, first, last, year) => {
    const start = `${year}-${String(month).padStart(2, "0")}-${String(first).padStart(2, "0")}`;
    const end = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
    if (last < first || last - first > 30 || !isValidDate(start) || !isValidDate(end)) return;
    candidates.push({ index: match.index, phrase: match[0], dates: datesBetween(start, end) });
  };
  for (const match of content.matchAll(new RegExp(`\\b(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:\\s*(?:-|–|to|and)\\s*(\\d{1,2}))?\\s*,?\\s*(20\\d{2})\\b`, "gi"))) {
    addCandidate(match, MONTHS[match[1].toLowerCase()], Number(match[2]), Number(match[3] || match[2]), match[4]);
  }
  for (const match of content.matchAll(new RegExp(`\\b(\\d{1,2})(?:\\s*(?:-|–|to|and)\\s*(\\d{1,2}))?\\s+(?:ng\\s+)?(${MONTH_PATTERN})\\.?\\s*,?\\s*(20\\d{2})\\b`, "gi"))) {
    addCandidate(match, MONTHS[match[3].toLowerCase()], Number(match[1]), Number(match[2] || match[1]), match[4]);
  }
  for (const match of content.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    addCandidate(match, Number(match[2]), Number(match[3]), Number(match[3]), match[1]);
  }
  candidates.sort((a, b) => {
    if (!suspension) return a.index - b.index;
    const distance = (candidate) => Math.abs(candidate.index - suspension.index) - (candidate.index > suspension.index ? 20 : 0);
    return distance(a) - distance(b);
  });
  const selected = positive ? candidates[0] : null;
  const dates = selected?.dates || [];
  return {
    possibleSuspension: positive,
    scope: positive ? (partial ? "partial_day" : "full_day") : "none",
    dates,
    needsReview: true,
    evidence: { suspensionPhrase: positive ? suspension[0] : null, datePhrase: selected?.phrase || null },
    warnings: [
      ...(!positive ? ["No unambiguous class-suspension phrase was found."] : []),
      ...(partial ? ["Partial-day suspension detected. This system only blocks whole dates; do not confirm it as a full-day closure."] : []),
      ...(positive && !dates.length ? ["No unambiguous dated suspension was found; enter and verify the dates manually."] : []),
      ...(positive && /\b\d{1,2}\/\d{1,2}\/20\d{2}\b/.test(content) && !dates.length ? ["Numeric dates may be month/day or day/month; verify the original post."] : []),
      "Verify the school, campus, affected students, and dates against the original announcement.",
    ],
  };
}

module.exports = { datesBetween, lockClosureDates, findClosure, suggestClosure };
