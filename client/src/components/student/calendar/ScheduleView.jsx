export default function ScheduleView({ events = [] }) {
  const sorted = [...events].sort((left, right) =>
    `${left.date}${left.start}`.localeCompare(`${right.date}${right.start}`)
  );

  return (
    <div className="calendar-container">
      <table className="schedule-table">
        <thead>
          <tr><th>Date</th><th>Event</th><th>Time</th><th>Type</th></tr>
        </thead>
        <tbody>
          {sorted.map((event) => (
            <tr key={event.id}>
              <td>{event.date}</td>
              <td>{event.title}</td>
              <td>{event.start ? `${event.start} - ${event.end}` : "All day"}</td>
              <td><span className={`event-chip ${event.type}`}>{event.type}</span></td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan="4">No scheduled events.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
