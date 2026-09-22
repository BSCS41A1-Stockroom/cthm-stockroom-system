export function closureEvents(closures = []) {
  const events = [];
  for (const closure of closures) {
    const start = String(closure.start_date || "").slice(0, 10);
    const end = String(closure.end_date || "").slice(0, 10);
    let current = Date.parse(`${start}T00:00:00Z`);
    const last = Date.parse(`${end}T00:00:00Z`);
    if (!Number.isFinite(current) || !Number.isFinite(last)) continue;
    for (let count = 0; current <= last && count < 31; count++, current += 86_400_000) {
      events.push({
        id: `closure-${closure.id}-${count}`,
        closureId: closure.id,
        title: closure.title,
        date: new Date(current).toISOString().slice(0, 10),
        start: "",
        end: "",
        type: "holiday",
        description: `${closure.source_kind === "official_holiday" ? "Official holiday" : "Confirmed school closure"}${closure.department_name ? ` · ${closure.department_name}` : ""}`,
      });
    }
  }
  return events;
}

export function closureForDate(closures = [], date, departmentId) {
  if (!date) return null;
  return closures.find((closure) =>
    String(closure.start_date).slice(0, 10) <= date
    && date <= String(closure.end_date).slice(0, 10)
    && (closure.department_id == null || String(closure.department_id) === String(departmentId))
  ) || null;
}
