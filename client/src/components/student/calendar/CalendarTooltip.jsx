export default function CalendarTooltip({ events }) {
  if (!events.length) return null;

  return (
    <div className="calendar-tooltip">

      {events.map((event, index) => (
        <div
          key={index}
          className="tooltip-item"
        >
          <span className={`tooltip-dot ${event.type}`}></span>

          {event.title}
        </div>
      ))}

    </div>
  );
}