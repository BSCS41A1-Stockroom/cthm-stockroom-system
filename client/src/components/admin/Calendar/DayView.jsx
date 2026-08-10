import { formatDate } from "../../../utils/calendarUtils";

const hours = Array.from({ length: 14 }, (_, index) => index + 7);

export default function DayView({ events = [], selectedDate = new Date() }) {
  const selectedDateString = formatDate(selectedDate);
  const dayEvents = events.filter((event) => event.date === selectedDateString);

  return (
    <div className="calendar-container">
      <h2 className="view-title">
        {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
      </h2>
      <div className="day-view">
        {hours.map((hour) => {
          const time = `${String(hour).padStart(2, "0")}:00`;
          const slotEvents = dayEvents.filter((event) => event.start === time);
          return (
            <div key={time} className="day-row">
              <div className="day-hour">{time}</div>
              <div className="day-slot">
                {slotEvents.map((event) => (
                  <div key={event.id} className={`week-event ${event.type}`}>
                    {event.title} {event.end && `– ${event.end}`}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
