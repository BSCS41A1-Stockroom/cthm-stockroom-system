import { useEffect, useMemo } from "react";
import { FaArrowRight, FaCalendarAlt, FaCalendarDay, FaCheckCircle, FaClipboardList, FaClock, FaMapMarkerAlt } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import useProfessorData from "../../hooks/useProfessorData";
import { dateInTimeZone, timeLabel } from "../../utils/professorData";
import "../../styles/professor.css";

const shortDate = (value) => new Date(`${value}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
const eventTime = (event) => event.start && event.end ? `${timeLabel(event.start)} – ${timeLabel(event.end)}` : "All day";

export default function ProfessorDashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { pending, events, loading, error, reload } = useProfessorData();
  const today = dateInTimeZone();
  const todayActivities = useMemo(() => events.filter((event) => event.date === today), [events, today]);
  const upcoming = useMemo(() => events.filter((event) => event.date >= today), [events, today]);
  const greeting = useMemo(() => { const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", hourCycle: "h23" }).format(new Date())); return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"; }, []);

  useEffect(() => { document.title = "Professor Dashboard | CTHM Stock Room"; }, []);

  return <div className="professor-dashboard">
    <section className="professor-page-header"><div><div className="professor-page-eyebrow">PROFESSOR PORTAL</div><h1>{greeting}, {profile?.full_name || "Professor"}.</h1><p>Live borrowing reviews and CTHM laboratory schedules.</p></div><button type="button" className="professor-header-calendar-btn" onClick={() => navigate("/professor/calendar")}><FaCalendarAlt /><span>View Calendar</span></button></section>
    {error && <div className="professor-data-error" role="alert"><span>{error}</span><button type="button" onClick={() => reload()}>Retry</button></div>}
    <section className="professor-stat-grid">
      <button type="button" className="professor-stat-card professor-stat-card--pending" onClick={() => navigate("/professor/requests")}><div className="professor-stat-icon"><FaClipboardList /></div><div className="professor-stat-content"><span>Pending Requests</span><strong>{loading ? "—" : pending.length}</strong><small>Require your review</small></div><FaArrowRight className="professor-stat-arrow" /></button>
      <div className="professor-stat-card"><div className="professor-stat-icon"><FaCalendarDay /></div><div className="professor-stat-content"><span>Today's Activities</span><strong>{loading ? "—" : todayActivities.length}</strong><small>Scheduled for today</small></div></div>
      <div className="professor-stat-card"><div className="professor-stat-icon"><FaCalendarAlt /></div><div className="professor-stat-content"><span>Upcoming Activities</span><strong>{loading ? "—" : upcoming.length}</strong><small>Today and later</small></div></div>
    </section>
    <section className="professor-dashboard-grid">
      <div className="professor-dashboard-card"><div className="professor-card-header"><div><h2>Pending Requests</h2><p>Students waiting for your authorization.</p></div><button type="button" className="professor-view-all" onClick={() => navigate("/professor/requests")}>View All <FaArrowRight /></button></div><div className="professor-request-list">
        {loading ? <div className="professor-empty-state">Loading requests...</div> : pending.length === 0 ? <div className="professor-empty-state"><FaCheckCircle /><strong>All caught up</strong><span>No requests require your review.</span></div> : pending.slice(0, 4).map((request) => <div className="professor-request-row" key={request.id}><div className="professor-request-avatar">{request.studentName?.charAt(0) || "S"}</div><div className="professor-request-info"><strong>{request.studentName}</strong><span>{request.purpose}</span><small>{shortDate(String(request.borrowDate).slice(0, 10))} · {(request.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)} unit(s)</small></div><button type="button" className="professor-review-btn" onClick={() => navigate(`/authorize/${request.authorizationToken}`)}>Review</button></div>)}
      </div></div>
      <div className="professor-dashboard-card"><div className="professor-card-header"><div><h2>Today's Schedule</h2><p>Calendar activities for today.</p></div><button type="button" className="professor-view-all" onClick={() => navigate("/professor/calendar")}>Calendar <FaArrowRight /></button></div><div className="professor-schedule-list">
        {loading ? <div className="professor-empty-state">Loading schedule...</div> : todayActivities.length === 0 ? <div className="professor-empty-state"><FaCalendarDay /><strong>No activities today</strong><span>The calendar is clear.</span></div> : todayActivities.map((activity) => <div className="professor-schedule-item" key={activity.id}><div className="professor-schedule-time"><FaClock /><span>{eventTime(activity)}</span></div><div className="professor-schedule-details"><strong>{activity.title}</strong><span><FaMapMarkerAlt />{activity.room}</span></div></div>)}
      </div></div>
    </section>
    <section className="professor-quick-actions"><button type="button" className="professor-quick-action" onClick={() => navigate("/professor/qr")}><FaCalendarAlt /><div><strong>Scan Request QR</strong><span>Open a protected authorization review.</span></div><FaArrowRight /></button><button type="button" className="professor-quick-action" onClick={() => navigate("/professor/requests")}><FaClipboardList /><div><strong>Review Requests</strong><span>Review and sign pending requests.</span></div><FaArrowRight /></button></section>
  </div>;
}
