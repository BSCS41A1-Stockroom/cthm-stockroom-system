import { formatDate } from "../../../utils/calendarUtils";

const hours = Array.from({ length: 12 }, (_, index) => index + 7);

export default function WeekView({ selectedDate = new Date(), events = [] }) {
  const weekStart = new Date(selectedDate);
  weekStart.setDate(selectedDate.getDate() - selectedDate.getDay());
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return date;
  });

  return (
    <div className="week-container">
      <div className="week-header">
        <div className="time-column"></div>
        {days.map((day) => (
          <div key={formatDate(day)} className="week-day">
            {day.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}
          </div>
        ))}
      </div>
      <div className="week-body">
        {hours.map((hour) => {
          const time = `${String(hour).padStart(2, "0")}:00`;
          return (
            <div key={time} style={{ display: "contents" }}>
              <div className="week-time">{time}</div>
              {days.map((day) => (
                <div key={formatDate(day)} className="week-cell">
                  {events.filter((event) => event.date === formatDate(day) && event.start === time).map((event) => (
                    <div key={event.id} className={`week-event ${event.type}`}>{event.title}</div>
                  ))}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
