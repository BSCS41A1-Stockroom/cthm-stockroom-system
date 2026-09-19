import { useEffect, useMemo, useState } from "react";

import "../../styles/calendar.css";

import useProfessorData from "../../hooks/useProfessorData";

import {
    dateInTimeZone,
} from "../../utils/professorData";

import CalendarToolbar from "../../components/admin/Calendar/CalendarToolbar";
import LeftSidebar from "../../components/admin/Calendar/LeftSidebar";
import MonthView from "../../components/admin/Calendar/MonthView";
import WeekView from "../../components/admin/Calendar/WeekView";
import DayView from "../../components/admin/Calendar/DayView";
import ScheduleView from "../../components/admin/Calendar/ScheduleView";


/* =========================================================
   PROFESSOR CALENDAR
   Same UI / components as Admin Calendar
   Read-only version
========================================================= */

function normalizeEvent(event) {
    return {
        id: event.id,
        title: event.title || "Untitled Activity",

        date: event.date || "",

        start: event.start || "",
        end: event.end || "",

        type: event.type || "activity",

        description: event.description || "",

        roomId:
            event.roomId ||
            event.room_id ||
            "",

        roomName:
            event.roomName ||
            event.room ||
            "",

        room:
            event.room ||
            event.roomName ||
            "",

        student:
            event.student ||
            "",

        studentId:
            event.studentId ||
            "",

        items:
            Array.isArray(event.items)
                ? event.items
                : [],

        borrowRequestId:
            event.borrowRequestId ||
            event.borrow_request_id ||
            null,
    };
}


function parseDate(value) {
    if (!value) {
        return new Date();
    }

    return new Date(`${value}T00:00:00`);
}


export default function ProfessorCalendar() {

    const {
        events: professorEvents,
        loading,
        error,
        reload,
    } = useProfessorData();


    /* =====================================================
       NORMALIZE PROFESSOR EVENTS
    ===================================================== */

    const events = useMemo(() => {

        return (professorEvents || []).map(
            normalizeEvent
        );

    }, [professorEvents]);


    /* =====================================================
       CURRENT DATE
    ===================================================== */

    const today = new Date();


    const [currentMonth, setCurrentMonth] =
        useState(today.getMonth());


    const [currentYear, setCurrentYear] =
        useState(today.getFullYear());


    const [selectedDate, setSelectedDate] =
        useState(today);


    const [calendarView, setCalendarView] =
        useState("Month");


    /* =====================================================
       KEEP SELECTED DATE IN SYNC
    ===================================================== */

    useEffect(() => {

        if (
            selectedDate.getMonth() !==
                currentMonth ||
            selectedDate.getFullYear() !==
                currentYear
        ) {

            const nextDate =
                new Date(selectedDate);

            nextDate.setMonth(
                currentMonth
            );

            nextDate.setFullYear(
                currentYear
            );

            setSelectedDate(nextDate);
        }

    }, [
        currentMonth,
        currentYear,
        selectedDate,
    ]);


    /* =====================================================
       PROFESSOR DATA RELOAD
    ===================================================== */

    useEffect(() => {

        if (typeof reload === "function") {
            reload();
        }

    }, []);


    /* =====================================================
       TODAY
    ===================================================== */

    const todayString =
        dateInTimeZone();


    /* =====================================================
       READ-ONLY TOOLBAR ACTION
       
       Admin Calendar requires onAdd.
       Professor Calendar does not create events.
    ===================================================== */

    const handleAdd = () => {
        // Professor calendar is read-only.
    };


    /* =====================================================
       DATE SELECTION
    ===================================================== */

    const handleSelectedDate = (date) => {

        if (!date) {
            return;
        }

        const nextDate =
            date instanceof Date
                ? date
                : parseDate(date);


        setSelectedDate(nextDate);

        setCurrentMonth(
            nextDate.getMonth()
        );

        setCurrentYear(
            nextDate.getFullYear()
        );

    };


    /* =====================================================
       LOADING / ERROR
    ===================================================== */

    return (

        <div className="calendar-page">

            {/* =================================================
                PAGE HEADER
            ================================================= */}

            <div className="calendar-page-header">

                <div className="calendar-page-title">

                    <h2>
                        Calendar
                    </h2>

                    <p>
                        View laboratory schedules,
                        activities, and approved
                        borrowing schedules.
                    </p>

                </div>

            </div>


            {/* =================================================
                ERROR
            ================================================= */}

            {error && (

                <p className="form-error">

                    {error}

                    {typeof reload === "function" && (

                        <button
                            type="button"
                            onClick={reload}
                            style={{
                                marginLeft: "10px",
                            }}
                        >
                            Retry
                        </button>

                    )}

                </p>

            )}


            {/* =================================================
                LOADING
            ================================================= */}

            {loading && events.length === 0 && (

                <div
                    className="sidebar-card"
                    style={{
                        padding: "16px",
                    }}
                >
                    Loading calendar...
                </div>

            )}


            {/* =================================================
                CALENDAR TOOLBAR

                SAME ADMIN COMPONENT
            ================================================= */}

            <CalendarToolbar

                currentMonth={
                    currentMonth
                }

                currentYear={
                    currentYear
                }

                setCurrentMonth={
                    setCurrentMonth
                }

                setCurrentYear={
                    setCurrentYear
                }

                calendarView={
                    calendarView
                }

                setCalendarView={
                    setCalendarView
                }

                onAdd={
                    handleAdd
                }

            />


            {/* =================================================
                CALENDAR CONTENT

                SAME ADMIN STRUCTURE
            ================================================= */}

            <div className="calendar-layout">


                {/* =================================================
                    LEFT SIDEBAR
                ================================================= */}

                <LeftSidebar

                    currentMonth={
                        currentMonth
                    }

                    currentYear={
                        currentYear
                    }

                    selectedDate={
                        selectedDate
                    }

                    setSelectedDate={
                        handleSelectedDate
                    }

                    events={
                        events
                    }

                />


                {/* =================================================
                    MONTH VIEW
                ================================================= */}

                {calendarView === "Month" && (

                    <MonthView

                        currentMonth={
                            currentMonth
                        }

                        currentYear={
                            currentYear
                        }

                        selectedDate={
                            selectedDate
                        }

                        setSelectedDate={
                            handleSelectedDate
                        }

                        events={
                            events
                        }

                    />

                )}


                {/* =================================================
                    WEEK VIEW
                ================================================= */}

                {calendarView === "Week" && (

                    <WeekView

                        events={
                            events
                        }

                        selectedDate={
                            selectedDate
                        }

                    />

                )}


                {/* =================================================
                    DAY VIEW
                ================================================= */}

                {calendarView === "Day" && (

                    <DayView

                        events={
                            events
                        }

                        selectedDate={
                            selectedDate
                        }

                    />

                )}


                {/* =================================================
                    SCHEDULE VIEW
                ================================================= */}

                {calendarView === "Schedule" && (

                    <ScheduleView

                        events={
                            events
                        }

                    />

                )}

            </div>

        </div>

    );
}