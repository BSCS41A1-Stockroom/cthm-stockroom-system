import {
  FiMenu,
  FiChevronLeft,
  FiChevronRight,
  FiSearch,
} from "react-icons/fi";

import { MdOutlineCalendarMonth } from "react-icons/md";
import { useState } from "react";
import { FaChevronDown } from "react-icons/fa";

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

export default function CalendarToolbar({
    currentMonth,
    currentYear,
    setCurrentMonth,
    setCurrentYear,
    calendarView,
    setCalendarView,
}) {

    const [showMenu, setShowMenu] = useState(false);

  const previousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
  };

  return (
    <header className="calendar-toolbar">

      <div className="toolbar-left">

        <button className="toolbar-btn">
          ☰
        </button>

        <button
          className="toolbar-btn"
          onClick={previousMonth}
        >
          ❮
        </button>

        <button
          className="toolbar-btn"
          onClick={nextMonth}
        >
          ❯
        </button>

        <button
          className="today-btn"
          onClick={goToToday}
        >
          Today
        </button>

        <h2>
          {months[currentMonth]} {currentYear}
        </h2>

      </div>

      <div className="toolbar-right">

        <div className="view-dropdown">

            <button
            className="view-btn"
            onClick={() => setShowMenu(prev => !prev)}
            >
            {calendarView}
            <FaChevronDown
                className={showMenu ? "rotate" : ""}
            />
            </button>

            <div
            className={`view-menu ${
                showMenu ? "show" : ""
            }`}
            >
            {["Month", "Week", "Day", "Schedule"].map(view => (

                <button
                key={view}
                onClick={() => {
                    setCalendarView(view);
                    setShowMenu(false);
                }}
                >
                {view}
                </button>

            ))}
            </div>

        </div>

        </div>

    </header>
  );
}