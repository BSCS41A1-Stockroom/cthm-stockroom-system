import CalendarTooltip from "./CalendarTooltip";
import { formatDate } from "../../../utils/calendarUtils";

const weekDays = ["S", "M", "T", "W", "T", "F", "S"];

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function MiniCalendar({
  currentMonth,
  currentYear,
  selectedDate,
  setSelectedDate,
  events,
}) {

  const firstDay = new Date(
    currentYear,
    currentMonth,
    1
  ).getDay();

  const daysInMonth = new Date(
    currentYear,
    currentMonth + 1,
    0
  ).getDate();

  const cells = [];

  for (let i = 0; i < firstDay; i++) {
    cells.push(
      <div key={`blank-${i}`}></div>
    );
  }

  for (let day = 1; day <= daysInMonth; day++) {

    const date = new Date(
      currentYear,
      currentMonth,
      day
    );

    const dateString = formatDate(date);

    const dayEvents = events.filter(
      event => event.date === dateString
    );

    const selected =
      selectedDate.getDate() === day &&
      selectedDate.getMonth() === currentMonth &&
      selectedDate.getFullYear() === currentYear;

    const today =
      new Date().toDateString() === date.toDateString();

    cells.push(

      <div
        key={day}
        className="mini-day"
        onClick={() => setSelectedDate(date)}
      >

        <span
          className={`
            mini-day-number
            ${today ? "today" : ""}
            ${selected ? "selected" : ""}
          `}
        >
          {day}
        </span>

        {dayEvents.length > 0 && (

          <div className="mini-dots">

            {dayEvents.slice(0,3).map(event => (

              <span
                key={event.id}
                className={`mini-dot ${event.type}`}
              />

            ))}

          </div>

        )}

        <CalendarTooltip
          events={dayEvents}
        />

      </div>

    );

  }

  return (

    <div className="sidebar-card">

      <h3>
        {months[currentMonth]} {currentYear}
      </h3>

      <div className="mini-weekdays">

        {weekDays.map(day => (

          <div key={day}>
            {day}
          </div>

        ))}

      </div>

      <div className="mini-grid">

        {cells}

      </div>

    </div>

  );

}
