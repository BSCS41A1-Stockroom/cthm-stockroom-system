export default function EventPopover({
  open,
  position,
  date,
  events,
  onClose,
}) {
  if (!open) return null;

  return (
    <div
      className="event-popover"
      style={{
        top: position.y,
        left: position.x,
      }}
    >
      <div className="popover-header">

        <strong>{date}</strong>

        <button onClick={onClose}>
          ✕
        </button>

      </div>

      {events.length === 0 ? (
        <p>No events.</p>
      ) : (
        events.map((event, index) => (
          <div
            key={index}
            className="popover-event"
          >
            <span className={`tooltip-dot ${event.type}`}></span>

            {event.title}
          </div>
        ))
      )}
    </div>
  );
}