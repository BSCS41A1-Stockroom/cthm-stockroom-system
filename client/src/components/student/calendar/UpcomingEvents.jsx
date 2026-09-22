import { getUpcomingEvents } from "../../../utils/calendarUtils";

export default function UpcomingEvents({ events = [] }) {
  const upcoming = getUpcomingEvents(events);

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
