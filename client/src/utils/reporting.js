export function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function reportPreset(preset, now = new Date()) {
  const to = localDateString(now);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "week") start.setDate(start.getDate() - 6);
  else if (preset === "year") start.setMonth(0, 1);
  else start.setDate(1);
  return { from: localDateString(start), to };
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function reportCsv(data) {
  const rows = [
    ["CTHM Stockroom Report"],
    ["From", data.range.from, "To", data.range.to],
    [],
    ["Metric", "Value"],
    ...Object.entries(data.summary).map(([name, value]) => [name, value]),
    [],
    ["Most Borrowed Item", "Units"],
    ...data.mostBorrowed.map((item) => [item.item, item.borrowed]),
    [],
    ["Month", "Borrowings", "Approved", "Returned"],
    ...data.monthly.map((month) => [month.month, month.borrowings, month.approved, month.returned]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
