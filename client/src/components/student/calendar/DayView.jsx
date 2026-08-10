import { formatDate } from "../../../utils/calendarUtils";

const hours = Array.from({ length: 12 }, (_, index) => index + 7);

export default function DayView({ selectedDate = new Date(), events = [] }) {
  const date = formatDate(selectedDate);
  return (
    <div className="week-container">
      <div className="week-header">
        <div className="time-column"></div>
        <div className="week-day" style={{ gridColumn: "span 7" }}>
          {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </div>
      </div>
      <div className="week-body">
        {hours.map((hour) => {
          const time = `${String(hour).padStart(2, "0")}:00`;
          return (
            <div key={time} style={{ display: "contents" }}>
              <div className="week-time">{time}</div>
              <div className="week-cell" style={{ gridColumn: "span 7" }}>
                {events.filter((event) => event.date === date && event.start === time).map((event) => (
                  <div key={event.id} className={`week-event ${event.type}`}>{event.title}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
