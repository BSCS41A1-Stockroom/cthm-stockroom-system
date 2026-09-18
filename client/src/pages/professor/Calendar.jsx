import { useMemo, useState } from "react";
import {
  FaChevronLeft,
  FaChevronRight,
  FaCalendarAlt,
  FaClock,
  FaMapMarkerAlt,
  FaBoxOpen,
  FaUser,
} from "react-icons/fa";

import "../../styles/professor.css";

const SAMPLE_EVENTS = [
  {
    id: 1,
    title: "Food & Beverage Laboratory",
    student: "Juan Dela Cruz",
    program: "BS Hospitality Management",
    date: "2026-09-20",
    start: "09:00",
    end: "11:00",
    room: "CTHM Laboratory 1",
    items: ["Dinner Plate", "Wine Glass", "Table Cloth"],
  },
  {
    id: 2,
    title: "Housekeeping Laboratory",
    student: "Maria Santos",
    program: "BS Hospitality Management",
    date: "2026-09-21",
    start: "13:00",
    end: "15:00",
    room: "CTHM Laboratory 2",
    items: ["Vacuum Cleaner", "Cleaning Cart"],
  },
  {
    id: 3,
    title: "Bar Service Activity",
    student: "Pedro Reyes",
    program: "BS Hospitality Management",
    date: "2026-09-22",
    start: "10:00",
    end: "12:00",
    room: "Bar Laboratory",
    items: ["Cocktail Shaker", "Bar Glass", "Jigger"],
  },
];

function formatTime(time) {
  const [hour, minute] = time.split(":");
  const h = Number(hour);

  const suffix = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 || 12;

  return `${displayHour}:${minute} ${suffix}`;
}

function formatDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(
    "en-US",
    {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }
  );
}

function getWeekDates(date) {
  const current = new Date(date);
  const day = current.getDay();

  const mondayOffset = day === 0 ? -6 : 1 - day;

  current.setDate(current.getDate() + mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(current);
    d.setDate(current.getDate() + index);
    return d;
  });
}

function dateToString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function ProfessorCalendar() {
  const [currentDate, setCurrentDate] = useState(
    new Date("2026-09-20T00:00:00")
  );

  const [selectedEvent, setSelectedEvent] = useState(null);

  const weekDates = useMemo(
    () => getWeekDates(currentDate),
    [currentDate]
  );

  const goPreviousWeek = () => {
    setCurrentDate((previous) => {
      const next = new Date(previous);
      next.setDate(next.getDate() - 7);
      return next;
    });
  };

  const goNextWeek = () => {
    setCurrentDate((previous) => {
      const next = new Date(previous);
      next.setDate(next.getDate() + 7);
      return next;
    });
  };

  const goToday = () => {
    setCurrentDate(new Date());
  };

  const weekLabel = `${weekDates[0].toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} – ${weekDates[6].toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  return (
    <div className="professor-calendar-page">

      {/* HEADER */}
      <header className="professor-page-header">
        <div>
          <span className="professor-eyebrow">
            ACADEMIC SCHEDULE
          </span>

          <h1>Calendar</h1>

          <p>
            View your assigned laboratory activities and approved
            borrowing schedules.
          </p>
        </div>

        <div className="professor-calendar-header-icon">
          <FaCalendarAlt />
        </div>
      </header>

      {/* CALENDAR TOOLBAR */}
      <section className="professor-calendar-toolbar">

        <div className="professor-calendar-navigation">
          <button
            type="button"
            className="professor-calendar-nav-btn"
            onClick={goPreviousWeek}
            aria-label="Previous week"
          >
            <FaChevronLeft />
          </button>

          <button
            type="button"
            className="professor-today-btn"
            onClick={goToday}
          >
            Today
          </button>

          <button
            type="button"
            className="professor-calendar-nav-btn"
            onClick={goNextWeek}
            aria-label="Next week"
          >
            <FaChevronRight />
          </button>
        </div>

        <h2>{weekLabel}</h2>

        <div className="professor-calendar-view-label">
          Weekly View
        </div>

      </section>

      {/* WEEK CALENDAR */}
      <section className="professor-calendar-card">

        <div className="professor-week-grid">

          {weekDates.map((date) => {
            const dateString = dateToString(date);

            const events = SAMPLE_EVENTS.filter(
              (event) => event.date === dateString
            );

            const isToday =
              dateToString(new Date()) === dateString;

            return (
              <div
                className={`professor-day-column ${
                  isToday ? "today" : ""
                }`}
                key={dateString}
              >

                {/* DAY HEADER */}
                <div className="professor-day-header">

                  <span className="professor-day-name">
                    {date.toLocaleDateString("en-US", {
                      weekday: "short",
                    })}
                  </span>

                  <span className="professor-day-number">
                    {date.getDate()}
                  </span>

                </div>

                {/* EVENTS */}
                <div className="professor-day-events">

                  {events.length === 0 ? (
                    <div className="professor-empty-day">
                      No activity
                    </div>
                  ) : (
                    events.map((event) => (
                      <button
                        type="button"
                        className="professor-calendar-event"
                        key={event.id}
                        onClick={() => setSelectedEvent(event)}
                      >

                        <div className="professor-event-time">
                          {formatTime(event.start)} –{" "}
                          {formatTime(event.end)}
                        </div>

                        <div className="professor-event-title">
                          {event.title}
                        </div>

                        <div className="professor-event-student">
                          {event.student}
                        </div>

                        <div className="professor-event-room">
                          <FaMapMarkerAlt />
                          {event.room}
                        </div>

                      </button>
                    ))
                  )}

                </div>

              </div>
            );
          })}

        </div>

      </section>

      {/* UPCOMING ACTIVITIES */}
      <section className="professor-upcoming-section">

        <div className="professor-section-heading">
          <div>
            <span className="professor-eyebrow">
              SCHEDULED ACTIVITIES
            </span>

            <h2>Upcoming Activities</h2>
          </div>

          <span className="professor-upcoming-count">
            {SAMPLE_EVENTS.length} Activities
          </span>
        </div>

        <div className="professor-upcoming-list">

          {SAMPLE_EVENTS.map((event) => (
            <button
              type="button"
              className="professor-upcoming-item"
              key={event.id}
              onClick={() => setSelectedEvent(event)}
            >

              <div className="professor-upcoming-date">
                <span>
                  {new Date(
                    `${event.date}T00:00:00`
                  ).toLocaleDateString("en-US", {
                    month: "short",
                  })}
                </span>

                <strong>
                  {new Date(
                    `${event.date}T00:00:00`
                  ).getDate()}
                </strong>
              </div>

              <div className="professor-upcoming-content">

                <strong>{event.title}</strong>

                <span>
                  {event.student} · {event.program}
                </span>

                <small>
                  {formatTime(event.start)} –{" "}
                  {formatTime(event.end)} · {event.room}
                </small>

              </div>

              <FaChevronRight className="professor-upcoming-arrow" />

            </button>
          ))}

        </div>

      </section>

      {/* EVENT DETAILS MODAL */}
      {selectedEvent && (
        <div
          className="professor-modal-overlay"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="professor-event-modal"
            onClick={(event) => event.stopPropagation()}
          >

            <div className="professor-modal-header">

              <div>
                <span className="professor-eyebrow">
                  ACTIVITY DETAILS
                </span>

                <h2>{selectedEvent.title}</h2>
              </div>

              <button
                type="button"
                className="professor-modal-close"
                onClick={() => setSelectedEvent(null)}
              >
                ×
              </button>

            </div>

            <div className="professor-event-details">

              <div className="professor-detail-row">
                <FaCalendarAlt />

                <div>
                  <span>Date</span>
                  <strong>
                    {formatDate(selectedEvent.date)}
                  </strong>
                </div>
              </div>

              <div className="professor-detail-row">
                <FaClock />

                <div>
                  <span>Schedule</span>
                  <strong>
                    {formatTime(selectedEvent.start)} –{" "}
                    {formatTime(selectedEvent.end)}
                  </strong>
                </div>
              </div>

              <div className="professor-detail-row">
                <FaMapMarkerAlt />

                <div>
                  <span>Assigned Laboratory</span>
                  <strong>{selectedEvent.room}</strong>
                </div>
              </div>

              <div className="professor-detail-row">
                <FaUser />

                <div>
                  <span>Student</span>
                  <strong>
                    {selectedEvent.student}
                  </strong>
                </div>
              </div>

              <div className="professor-detail-row">
                <FaBoxOpen />

                <div>
                  <span>Requested Items</span>

                  <div className="professor-item-list">
                    {selectedEvent.items.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                </div>
              </div>

            </div>

            <div className="professor-modal-footer">
              <button
                type="button"
                className="professor-secondary-btn"
                onClick={() => setSelectedEvent(null)}
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}