import { formatDate } from "../../../utils/calendarUtils";

const hours = Array.from({ length: 14 }, (_, index) => index + 7);

export default function WeekView({ events = [], selectedDate = new Date() }) {
  const weekStart = new Date(selectedDate);
  weekStart.setDate(selectedDate.getDate() - selectedDate.getDay());
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return date;
  });

  return (
    <div className="calendar-container week-view">
      <div className="week-header">
        <div className="time-column"></div>
        {days.map((day) => (
          <div key={formatDate(day)} className="week-day-header">
            {day.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}
          </div>
        ))}
      </div>
      <div className="week-body">
        {hours.map((hour) => {
          const time = `${String(hour).padStart(2, "0")}:00`;
          return (
            <div key={time} className="week-row">
              <div className="week-time">{time}</div>
              {days.map((day) => {
                const slotEvents = events.filter((event) =>
                  event.date === formatDate(day) && event.start === time
                );
                return (
                  <div key={formatDate(day)} className="week-cell">
                    {slotEvents.map((event) => (
                      <div key={event.id} className={`week-event ${event.type}`}>{event.title}</div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
