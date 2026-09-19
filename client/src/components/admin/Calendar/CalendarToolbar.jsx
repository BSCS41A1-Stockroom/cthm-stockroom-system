
import { useState } from "react";
import {
    FaChevronDown,
    FaChevronLeft,
    FaChevronRight,
    FaPlus,
} from "react-icons/fa";

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
    onAdd,
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

            {/* LEFT SIDE */}
            <div className="toolbar-left">

                <div className="calendar-navigation">

                    <button
                        type="button"
                        className="toolbar-btn"
                        onClick={previousMonth}
                        aria-label="Previous month"
                    >
                        <FaChevronLeft />
                    </button>

                    <button
                        type="button"
                        className="toolbar-btn"
                        onClick={nextMonth}
                        aria-label="Next month"
                    >
                        <FaChevronRight />
                    </button>

                </div>

                <button
                    type="button"
                    className="today-btn"
                    onClick={goToToday}
                >
                    Today
                </button>

                <div className="calendar-current-period">
                    <span className="calendar-current-month">
                        {months[currentMonth]}
                    </span>

                    <span className="calendar-current-year">
                        {currentYear}
                    </span>
                </div>

            </div>


            {/* RIGHT SIDE */}
            <div className="toolbar-right">

                <button
                    type="button"
                    className="add-btn"
                    onClick={onAdd}
                >
                    <FaPlus />
                    <span>Create</span>
                </button>


                <div className="view-dropdown">

                    <button
                        type="button"
                        className={`view-btn ${
                            showMenu ? "open" : ""
                        }`}
                        onClick={() =>
                            setShowMenu((prev) => !prev)
                        }
                        aria-expanded={showMenu}
                    >
                        <span>{calendarView}</span>

                        <FaChevronDown
                            className={
                                showMenu
                                    ? "rotate"
                                    : ""
                            }
                        />
                    </button>


                    {showMenu && (
                        <div className="view-menu show">

                            {[
                                "Month",
                                "Week",
                                "Day",
                                "Schedule",
                            ].map((view) => (

                                <button
                                    type="button"
                                    key={view}
                                    className={
                                        calendarView === view
                                            ? "active"
                                            : ""
                                    }
                                    onClick={() => {
                                        setCalendarView(view);
                                        setShowMenu(false);
                                    }}
                                >
                                    <span>{view}</span>

                                    {calendarView === view && (
                                        <span className="view-menu-check">
                                            ✓
                                        </span>
                                    )}
                                </button>

                            ))}

                        </div>
                    )}

                </div>

            </div>

        </header>
    );
}

