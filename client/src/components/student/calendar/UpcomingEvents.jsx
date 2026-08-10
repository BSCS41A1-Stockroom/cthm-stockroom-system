export default function UpcomingEvents({ events = [] }) {
  const upcoming = [...events]
    .filter((event) => event.date >= new Date().toISOString().slice(0, 10))
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, 5);

  return (
    <div className="sidebar-card">
      <h3>Upcoming Events</h3>
      {upcoming.map((event) => (
        <div key={event.id} className={`upcoming-event ${event.type}`}>
          {event.title}
        </div>
      ))}
      {upcoming.length === 0 && <p>No upcoming events.</p>}
    </div>
  );
}
