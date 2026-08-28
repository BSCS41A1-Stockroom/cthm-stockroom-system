import test from "node:test";
import assert from "node:assert/strict";
import { reportCsv, reportPreset } from "./reporting.js";

test("creates stable dashboard date presets", () => {
  const now = new Date(2026, 7, 28, 10);
  assert.deepEqual(reportPreset("week", now), { from: "2026-08-22", to: "2026-08-28" });
  assert.deepEqual(reportPreset("month", now), { from: "2026-08-01", to: "2026-08-28" });
  assert.deepEqual(reportPreset("year", now), { from: "2026-01-01", to: "2026-08-28" });
});

test("escapes report CSV cells safely", () => {
  const csv = reportCsv({
    range: { from: "2026-01-01", to: "2026-08-28" },
    summary: { total_borrowings: 2 },
    mostBorrowed: [{ item: 'Pan, "Large"', borrowed: 3 }, { item: "=HYPERLINK(1)", borrowed: 1 }],
    monthly: [{ month: "2026-08", borrowings: 2, approved: 1, returned: 1 }],
  });
  assert.match(csv, /"Pan, ""Large""",3/);
  assert.match(csv, /'=HYPERLINK\(1\),1/);
});
