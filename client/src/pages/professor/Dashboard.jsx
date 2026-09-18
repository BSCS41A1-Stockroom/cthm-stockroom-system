import { useEffect, useMemo, useState } from "react";
import {
    FaClipboardList,
    FaCalendarDay,
    FaCalendarAlt,
    FaArrowRight,
    FaClock,
    FaMapMarkerAlt,
    FaCheckCircle,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";

import "../../styles/professor.css";

export default function ProfessorDashboard() {
    const navigate = useNavigate();

    /*
     * Temporary dashboard data.
     * We will replace these with the actual API/Supabase
     * data once the Professor page structure is finished.
     */
    const [requests] = useState([
        {
            id: 1,
            student: "Juan Dela Cruz",
            program: "BS Hospitality Management",
            activity: "Food & Beverage Laboratory",
            date: "September 20, 2026",
            time: "9:00 AM – 11:00 AM",
        },
        {
            id: 2,
            student: "Maria Santos",
            program: "BS Hospitality Management",
            activity: "Housekeeping Laboratory",
            date: "September 21, 2026",
            time: "1:00 PM – 3:00 PM",
        },
        {
            id: 3,
            student: "Pedro Reyes",
            program: "BS Tourism Management",
            activity: "Bar Service Laboratory",
            date: "September 22, 2026",
            time: "10:00 AM – 12:00 PM",
        },
    ]);

    const [todayActivities] = useState([
        {
            id: 1,
            title: "Food & Beverage Laboratory",
            time: "9:00 AM – 11:00 AM",
            room: "CTHM Laboratory",
        },
        {
            id: 2,
            title: "Hospitality Management",
            time: "2:00 PM – 4:00 PM",
            room: "Room 204",
        },
    ]);

    const upcomingCount = 7;

    const greeting = useMemo(() => {
        const hour = new Date().getHours();

        if (hour < 12) {
            return "Good morning";
        }

        if (hour < 18) {
            return "Good afternoon";
        }

        return "Good evening";
    }, []);

    useEffect(() => {
        document.title =
            "Professor Dashboard | CTHM Stock Room";
    }, []);

    return (
        <div className="professor-dashboard">

            {/* =================================================
                HEADER
            ================================================= */}

            <section className="professor-page-header">

                <div>
                    <div className="professor-page-eyebrow">
                        PROFESSOR PORTAL
                    </div>

                    <h1>
                        {greeting}, Professor.
                    </h1>

                    <p>
                        Here's an overview of your CTHM
                        activities and student requests.
                    </p>
                </div>

                <button
                    type="button"
                    className="professor-header-calendar-btn"
                    onClick={() =>
                        navigate(
                            "/professor/calendar"
                        )
                    }
                >
                    <FaCalendarAlt />
                    <span>View Calendar</span>
                </button>

            </section>


            {/* =================================================
                STAT CARDS
            ================================================= */}

            <section className="professor-stat-grid">

                <button
                    type="button"
                    className="professor-stat-card professor-stat-card--pending"
                    onClick={() =>
                        navigate(
                            "/professor/requests"
                        )
                    }
                >
                    <div className="professor-stat-icon">
                        <FaClipboardList />
                    </div>

                    <div className="professor-stat-content">
                        <span>
                            Pending Requests
                        </span>

                        <strong>
                            {requests.length}
                        </strong>

                        <small>
                            Require your review
                        </small>
                    </div>

                    <FaArrowRight className="professor-stat-arrow" />
                </button>


                <div className="professor-stat-card">

                    <div className="professor-stat-icon">
                        <FaCalendarDay />
                    </div>

                    <div className="professor-stat-content">
                        <span>
                            Today's Activities
                        </span>

                        <strong>
                            {todayActivities.length}
                        </strong>

                        <small>
                            Scheduled for today
                        </small>
                    </div>

                </div>


                <div className="professor-stat-card">

                    <div className="professor-stat-icon">
                        <FaCalendarAlt />
                    </div>

                    <div className="professor-stat-content">
                        <span>
                            Upcoming Activities
                        </span>

                        <strong>
                            {upcomingCount}
                        </strong>

                        <small>
                            Scheduled activities
                        </small>
                    </div>

                </div>

            </section>


            {/* =================================================
                MAIN DASHBOARD GRID
            ================================================= */}

            <section className="professor-dashboard-grid">

                {/* =============================================
                    PENDING REQUESTS
                ============================================= */}

                <div className="professor-dashboard-card">

                    <div className="professor-card-header">

                        <div>
                            <h2>
                                Pending Requests
                            </h2>

                            <p>
                                Students waiting for
                                your confirmation.
                            </p>
                        </div>

                        <button
                            type="button"
                            className="professor-view-all"
                            onClick={() =>
                                navigate(
                                    "/professor/requests"
                                )
                            }
                        >
                            View All
                            <FaArrowRight />
                        </button>

                    </div>


                    <div className="professor-request-list">

                        {requests.length === 0 ? (
                            <div className="professor-empty-state">
                                <FaCheckCircle />

                                <strong>
                                    All caught up
                                </strong>

                                <span>
                                    No pending requests
                                    require your attention.
                                </span>
                            </div>
                        ) : (
                            requests.slice(0, 4).map(
                                (request) => (
                                    <div
                                        className="professor-request-row"
                                        key={request.id}
                                    >

                                        <div className="professor-request-avatar">
                                            {request.student
                                                .charAt(0)}
                                        </div>

                                        <div className="professor-request-info">

                                            <strong>
                                                {request.student}
                                            </strong>

                                            <span>
                                                {request.activity}
                                            </span>

                                            <small>
                                                {request.date}
                                                {" · "}
                                                {request.time}
                                            </small>

                                        </div>

                                        <button
                                            type="button"
                                            className="professor-review-btn"
                                            onClick={() =>
                                                navigate(
                                                    `/professor/requests?id=${request.id}`
                                                )
                                            }
                                        >
                                            Review
                                        </button>

                                    </div>
                                )
                            )
                        )}

                    </div>

                </div>


                {/* =============================================
                    TODAY'S SCHEDULE
                ============================================= */}

                <div className="professor-dashboard-card">

                    <div className="professor-card-header">

                        <div>
                            <h2>
                                Today's Schedule
                            </h2>

                            <p>
                                Your activities for today.
                            </p>
                        </div>

                        <button
                            type="button"
                            className="professor-view-all"
                            onClick={() =>
                                navigate(
                                    "/professor/calendar"
                                )
                            }
                        >
                            Calendar
                            <FaArrowRight />
                        </button>

                    </div>


                    <div className="professor-schedule-list">

                        {todayActivities.length === 0 ? (
                            <div className="professor-empty-state">
                                <FaCalendarDay />

                                <strong>
                                    No activities today
                                </strong>

                                <span>
                                    Your schedule is clear.
                                </span>
                            </div>
                        ) : (
                            todayActivities.map(
                                (activity) => (
                                    <div
                                        className="professor-schedule-item"
                                        key={activity.id}
                                    >

                                        <div className="professor-schedule-time">
                                            <FaClock />

                                            <span>
                                                {
                                                    activity.time
                                                }
                                            </span>
                                        </div>

                                        <div className="professor-schedule-details">

                                            <strong>
                                                {
                                                    activity.title
                                                }
                                            </strong>

                                            <span>
                                                <FaMapMarkerAlt />
                                                {
                                                    activity.room
                                                }
                                            </span>

                                        </div>

                                    </div>
                                )
                            )
                        )}

                    </div>

                </div>

            </section>


            {/* =================================================
                QUICK ACTIONS
            ================================================= */}

            <section className="professor-quick-actions">

                <button
                    type="button"
                    className="professor-quick-action"
                    onClick={() =>
                        navigate(
                            "/professor/qr"
                        )
                    }
                >
                    <FaCalendarAlt />

                    <div>
                        <strong>
                            Scan Student QR
                        </strong>

                        <span>
                            Quickly verify a student
                            borrowing request.
                        </span>
                    </div>

                    <FaArrowRight />
                </button>


                <button
                    type="button"
                    className="professor-quick-action"
                    onClick={() =>
                        navigate(
                            "/professor/requests"
                        )
                    }
                >
                    <FaClipboardList />

                    <div>
                        <strong>
                            Review Requests
                        </strong>

                        <span>
                            Review and confirm
                            pending student requests.
                        </span>
                    </div>

                    <FaArrowRight />
                </button>

            </section>

        </div>
    );
}