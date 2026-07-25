import {
  isToday,
  isSunday,
  isHoliday,
} from "../../../utils/calendarUtils";

import CalendarTooltip from "./CalendarTooltip";

import { getEvents } from "../../../utils/calendarUtils";

const weekDays = ["S", "M", "T", "W", "T", "F", "S"];

export default function MiniCalendar({
    currentMonth,
    currentYear,
    selectedDate,
    setSelectedDate,
}){
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();

  const daysInMonth = new Date(
    currentYear,
    currentMonth + 1,
    0
  ).getDate();

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

  const cells = [];

  // Blank cells
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`blank-${i}`}></div>);
  }

  // Days
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
        className="mini-day"
        onClick={() => setSelectedDate(date)}
        >

    <span
        className={`
        mini-day-number
        ${today ? "today" : ""}
        ${selected ? "selected" : ""}
        ${!selected && sunday ? "sunday" : ""}
        ${!selected && holiday ? "holiday" : ""}
        `}
    >
        {day}
    </span>

    {events.length > 0 && (
        <div className="mini-dots">
        {events.slice(0, 3).map((event, index) => (
            <span
            key={index}
            className={`mini-dot ${event.type}`}
            />
        ))}
        </div>
    )}

    <CalendarTooltip events={events} />

    </div>

    );
  }

  return (
    <div className="sidebar-card">

      <h3>
        {months[currentMonth]} {currentYear}
      </h3>

      <div className="mini-weekdays">
        {weekDays.map((day, index) => (
          <div
            key={index}
            className={index === 0 ? "sunday" : ""}
          >
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