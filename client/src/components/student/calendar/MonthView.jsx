import {
    isToday,
    isSunday,
    isHoliday,
    getEvents
} from "../../../utils/calendarUtils";

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarGrid({
    currentMonth,
    currentYear,
    selectedDate,
    setSelectedDate,
}) {
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();

  const daysInMonth = new Date(
    currentYear,
    currentMonth + 1,
    0
  ).getDate();

  const cells = [];

  for (let i = 0; i < firstDay; i++) {
    cells.push(
      <div
        key={`blank-${i}`}
        className="calendar-cell empty"
      />
    );
  }

  for (let day = 1; day <= daysInMonth; day++) {

  const date = new Date(currentYear, currentMonth, day);

  const today = isToday(date);
  const sunday = isSunday(date);
  const holiday = isHoliday(date);
  const events = getEvents(date);

  const selected =
    selectedDate.getDate() === day &&
    selectedDate.getMonth() === currentMonth &&
    selectedDate.getFullYear() === currentYear;

  cells.push(
    <div
        key={day}
        className="calendar-cell"
        onClick={() => setSelectedDate(date)}
    >
      <div
        className={`cell-date
        ${today ? "today" : ""}
        ${selected ? "selected" : ""}
        ${!selected && sunday ? "sunday" : ""}
        ${!selected && holiday ? "holiday" : ""}
        `}
      >
        {day}
      </div>

            {events.slice(0,3).map((event,index)=>(

            <div
                key={index}
                className={`calendar-event ${event.type}`}
            >
                {event.title}
            </div>

            ))}

            {events.length>3 && (

            <div className="calendar-more">

            +{events.length-3} more

            </div>

            )}

    </div>
  );
}

  return (
    <div className="calendar-container">

      <div className="calendar-weekdays">
        {weekDays.map((day, index) => (
            <div
                key={day}
                className={index === 0 ? "sunday" : ""}
            >
                {day}
            </div>
        ))}
      </div>

      <div className="calendar-grid">
        {cells}
      </div>

    </div>
  );
}