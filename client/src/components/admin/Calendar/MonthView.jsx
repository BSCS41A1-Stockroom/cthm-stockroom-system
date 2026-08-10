import { FaEdit, FaTrash } from "react-icons/fa";
import {
    isToday,
    isSunday,
    isHoliday,
    getEvents,
    formatDate,
} from "../../../utils/calendarUtils";

const weekDays = [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
];

export default function MonthView({
    currentMonth,
    currentYear,
    selectedDate,
    setSelectedDate,
    events,
    onEdit,
    onDelete,
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

    // Blank cells
    for (let i = 0; i < firstDay; i++) {
        cells.push(
            <div
                key={`blank-${i}`}
                className="calendar-cell empty"
            />
        );
    }

    // Calendar Days
    for (let day = 1; day <= daysInMonth; day++) {

        const date = new Date(
            currentYear,
            currentMonth,
            day
        );

        const today = isToday(date);
        const sunday = isSunday(date);

        const selected =
            selectedDate.getDate() === day &&
            selectedDate.getMonth() === currentMonth &&
            selectedDate.getFullYear() === currentYear;

        const dateString = formatDate(date);

        const dayEvents =
            Array.isArray(events)
                ? events.filter(
                      event => event.date === dateString
                  )
                : getEvents(date);
        const holiday = Array.isArray(events)
            ? dayEvents.some((event) => event.type === "holiday")
            : isHoliday(date);
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

                {dayEvents.slice(0, 3).map((event) => (

                    <div
                        key={event.id}
                        className={`calendar-event ${event.type}`}
                    >

                        <span className="event-title">
                            {event.title}
                        </span>

                        {!event.borrowRequestId && <div className="calendar-actions">

                            <button
                                type="button"
                                className="event-action"
                                aria-label={`Edit ${event.title}`}
                                title="Edit activity"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(event);
                                }}
                            >
                                <FaEdit />
                            </button>

                            <button
                                type="button"
                                className="event-action delete"
                                aria-label={`Delete ${event.title}`}
                                title="Delete activity"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(event);
                                }}
                            >
                                <FaTrash />
                            </button>

                        </div>}

                    </div>

                ))}

                {dayEvents.length > 3 && (

                    <div className="calendar-more">
                        +{dayEvents.length - 3} more
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
                        className={
                            index === 0
                                ? "sunday"
                                : ""
                        }
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
