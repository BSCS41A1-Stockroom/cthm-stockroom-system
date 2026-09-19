import { useMemo, useState } from "react";
import { FaBoxOpen, FaCalendarAlt, FaChevronLeft, FaChevronRight, FaClock, FaMapMarkerAlt, FaUser } from "react-icons/fa";
import useProfessorData from "../../hooks/useProfessorData";
import { dateInTimeZone, timeLabel } from "../../utils/professorData";
import "../../styles/professor.css";

function getWeekDates(date) {
  const monday = new Date(date);
  const day = monday.getDay();
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => { const result = new Date(monday); result.setDate(monday.getDate() + index); return result; });
}
function dateString(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function fullDate(value) { return new Date(`${value}T00:00:00`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" }); }
function schedule(event) { return event.start && event.end ? `${timeLabel(event.start)} – ${timeLabel(event.end)}` : "All day"; }

export default function ProfessorCalendar() {
  const { events, loading, error, reload } = useProfessorData();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);
  const today = dateInTimeZone();
  const upcoming = useMemo(() => events.filter((event) => event.date >= today), [events, today]);
  const weekLabel = `${weekDates[0].toLocaleDateString("en-PH", { month: "short", day: "numeric" })} – ${weekDates[6].toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`;
  const moveWeek = (days) => setCurrentDate((previous) => { const next = new Date(previous); next.setDate(next.getDate() + days); return next; });

  return <div className="professor-calendar-page">
    <header className="professor-page-header"><div><span className="professor-eyebrow">LIVE SCHEDULE</span><h1>Calendar</h1><p>View laboratory activities and approved borrowing schedules from the system calendar.</p></div><div className="professor-calendar-header-icon"><FaCalendarAlt /></div></header>
    {error && <div className="professor-data-error" role="alert"><span>{error}</span><button type="button" onClick={() => reload()}>Retry</button></div>}
    <section className="professor-calendar-toolbar"><div className="professor-calendar-navigation"><button type="button" className="professor-calendar-nav-btn" onClick={() => moveWeek(-7)} aria-label="Previous week"><FaChevronLeft /></button><button type="button" className="professor-today-btn" onClick={() => setCurrentDate(new Date())}>Today</button><button type="button" className="professor-calendar-nav-btn" onClick={() => moveWeek(7)} aria-label="Next week"><FaChevronRight /></button></div><h2>{weekLabel}</h2><div className="professor-calendar-view-label">Weekly View</div></section>
    <section className="professor-calendar-card"><div className="professor-week-grid">{weekDates.map((date) => {
      const key = dateString(date); const dayEvents = events.filter((event) => event.date === key);
      return <div className={`professor-day-column ${key === today ? "today" : ""}`} key={key}><div className="professor-day-header"><span className="professor-day-name">{date.toLocaleDateString("en-PH", { weekday: "short" })}</span><span className="professor-day-number">{date.getDate()}</span></div><div className="professor-day-events">{loading ? <div className="professor-empty-day">Loading...</div> : dayEvents.length === 0 ? <div className="professor-empty-day">No activity</div> : dayEvents.map((event) => <button type="button" className="professor-calendar-event" key={event.id} onClick={() => setSelectedEvent(event)}><div className="professor-event-time">{schedule(event)}</div><div className="professor-event-title">{event.title}</div><div className="professor-event-student">{event.student}</div><div className="professor-event-room"><FaMapMarkerAlt />{event.room}</div></button>)}</div></div>;
    })}</div></section>
    <section className="professor-upcoming-section"><div className="professor-section-heading"><div><span className="professor-eyebrow">SCHEDULED ACTIVITIES</span><h2>Upcoming Activities</h2></div><span className="professor-upcoming-count">{loading ? "Loading..." : `${upcoming.length} ${upcoming.length === 1 ? "Activity" : "Activities"}`}</span></div><div className="professor-upcoming-list">
      {!loading && upcoming.length === 0 && <div className="professor-empty-state"><FaCalendarAlt /><strong>No upcoming activities</strong><span>New calendar records will appear here automatically.</span></div>}
      {upcoming.map((event) => <button type="button" className="professor-upcoming-item" key={event.id} onClick={() => setSelectedEvent(event)}><div className="professor-upcoming-date"><span>{new Date(`${event.date}T00:00:00`).toLocaleDateString("en-PH", { month: "short" })}</span><strong>{new Date(`${event.date}T00:00:00`).getDate()}</strong></div><div className="professor-upcoming-content"><strong>{event.title}</strong><span>{event.student}{event.studentId ? ` · ${event.studentId}` : ""}</span><small>{schedule(event)} · {event.room}</small></div><FaChevronRight className="professor-upcoming-arrow" /></button>)}
    </div></section>
    {selectedEvent && <div className="professor-modal-overlay" onClick={() => setSelectedEvent(null)}><div className="professor-event-modal" onClick={(event) => event.stopPropagation()}><div className="professor-modal-header"><div><span className="professor-eyebrow">ACTIVITY DETAILS</span><h2>{selectedEvent.title}</h2></div><button type="button" className="professor-modal-close" onClick={() => setSelectedEvent(null)} aria-label="Close">×</button></div><div className="professor-event-details">
      <div className="professor-detail-row"><FaCalendarAlt /><div><span>Date</span><strong>{fullDate(selectedEvent.date)}</strong></div></div><div className="professor-detail-row"><FaClock /><div><span>Schedule</span><strong>{schedule(selectedEvent)}</strong></div></div><div className="professor-detail-row"><FaMapMarkerAlt /><div><span>Assigned Laboratory</span><strong>{selectedEvent.room}</strong></div></div><div className="professor-detail-row"><FaUser /><div><span>Student / Activity</span><strong>{selectedEvent.student}</strong>{selectedEvent.studentId && <small>{selectedEvent.studentId}</small>}</div></div><div className="professor-detail-row"><FaBoxOpen /><div><span>Requested Items</span><div className="professor-item-list">{selectedEvent.items.length ? selectedEvent.items.map((item) => <span key={`${item.id}-${item.name}`}>{item.name} × {item.quantity}</span>) : <span>No borrowing items linked</span>}</div></div></div>
    </div><div className="professor-modal-footer"><button type="button" className="professor-secondary-btn" onClick={() => setSelectedEvent(null)}>Close</button></div></div></div>}
  </div>;
}
