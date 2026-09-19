export function dateKey(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

export function dateInTimeZone(now = new Date(), timeZone = "Asia/Manila") {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function timeLabel(value) {
  if (!value) return "All day";
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "Time not set";
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
}

export function mapProfessorData(rawEvents = [], requests = []) {
  const requestById = new Map(requests.map((request) => [String(request.id), request]));
  const events = rawEvents.map((event) => {
    const request = event.borrow_request_id == null ? null : requestById.get(String(event.borrow_request_id));
    return {
      id: event.id,
      title: event.title || request?.purpose || "Scheduled activity",
      date: dateKey(event.event_date),
      start: event.start_time ? String(event.start_time).slice(0, 5) : "",
      end: event.end_time ? String(event.end_time).slice(0, 5) : "",
      type: event.event_type || "activity",
      description: event.description || "",
      room: event.room_name || "Room not assigned",
      requestId: event.borrow_request_id ?? null,
      student: request?.studentName || "General activity",
      studentId: request?.studentId || "",
      purpose: request?.purpose || event.description || "",
      status: request?.status || "scheduled",
      items: (request?.items || []).map((item) => ({
        id: item.inventoryId,
        name: item.name,
        quantity: Number(item.quantity) || 0,
      })),
    };
  });
  return {
    requests,
    pending: requests.filter((request) => request.status === "pending" && request.authorizationStatus === "awaiting"),
    events: events.sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`)),
  };
}
