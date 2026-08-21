import { useCallback, useEffect, useState } from "react";

import "../../styles/calendar.css";
import { supabase } from "../../lib/supabase";
import { API_URL } from "../../lib/api";

import CalendarToolbar from "../../components/admin/Calendar/CalendarToolbar";
import LeftSidebar from "../../components/admin/Calendar/LeftSidebar";
import MonthView from "../../components/admin/Calendar/MonthView";
import WeekView from "../../components/admin/Calendar/WeekView";
import DayView from "../../components/admin/Calendar/DayView";
import ScheduleView from "../../components/admin/Calendar/ScheduleView";
import ActivityModal from "../../components/admin/Calendar/ActivityModal";
import DeleteModal from "../../components/admin/Calendar/DeleteModal";

function mapEvent(event, roomNames) {
    return {
        id: event.id,
        title: event.title,
        date: event.event_date,
        start: event.start_time?.slice(0, 5) || "",
        end: event.end_time?.slice(0, 5) || "",
        type: event.event_type,
        description: event.description || "",
        roomId: event.room_id || "",
        roomName: roomNames.get(String(event.room_id)) || "",
        borrowRequestId: event.borrow_request_id,
    };
}

export default function Calendar() {

    const today = new Date();

    const [currentMonth, setCurrentMonth] =
        useState(today.getMonth());

    const [currentYear, setCurrentYear] =
        useState(today.getFullYear());

    const [selectedDate, setSelectedDate] =
        useState(today);

    const [calendarView, setCalendarView] =
        useState("Month");

    const [events, setEvents] =
        useState([]);

    const [rooms, setRooms] =
        useState([]);

    const [openModal, setOpenModal] =
        useState(false);

    const [editingEvent, setEditingEvent] =
        useState(null);

    const [deletingEvent, setDeletingEvent] =
        useState(null);

    const [error, setError] =
        useState("");


    const loadCalendar = useCallback(async () => {

        const [eventsResult, roomsResult] =
            await Promise.all([
                supabase
                    .from("calendar_events")
                    .select("*")
                    .order("event_date"),

                supabase
                    .from("laboratory_rooms")
                    .select("*")
                    .eq("is_active", true)
                    .order("name"),
            ]);


        const queryError =
            eventsResult.error ||
            roomsResult.error;


        if (queryError) {
            setError(queryError.message);
            return;
        }


        setError("");


        const roomNames = new Map(
            (roomsResult.data || []).map(
                (room) => [
                    String(room.id),
                    room.name
                ]
            )
        );


        setRooms(roomsResult.data || []);


        setEvents(
            (eventsResult.data || []).map(
                (event) =>
                    mapEvent(event, roomNames)
            )
        );

    }, []);


    useEffect(() => {

        const timer =
            window.setTimeout(
                loadCalendar,
                0
            );


        const channel =
            supabase
                .channel("calendar-sync")

                .on(
                    "postgres_changes",
                    {
                        event: "*",
                        schema: "public",
                        table: "calendar_events"
                    },
                    loadCalendar
                )

                .on(
                    "postgres_changes",
                    {
                        event: "*",
                        schema: "public",
                        table: "laboratory_rooms"
                    },
                    loadCalendar
                )

                .subscribe();


        return () => {

            window.clearTimeout(timer);

            supabase.removeChannel(
                channel
            );

        };

    }, [loadCalendar]);


    const openCreate = () => {

        setEditingEvent(null);

        setOpenModal(true);

    };


    const openEdit = (event) => {

        setEditingEvent(event);

        setOpenModal(true);

    };


    const saveEvent = async (form) => {

        const response = await fetch(

            editingEvent
                ? `${API_URL}/api/calendar/events/${editingEvent.id}`
                : `${API_URL}/api/calendar/events`,

            {
                method:
                    editingEvent
                        ? "PUT"
                        : "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify(form),
            }
        );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.reasons?.[0] ||
                result.message ||
                "Unable to save event."
            );

        }


        setOpenModal(false);

        setEditingEvent(null);

        await loadCalendar();

    };


    const deleteEvent = async (event) => {

        const response =
            await fetch(
                `${API_URL}/api/calendar/events/${event.id}`,
                {
                    method: "DELETE"
                }
            );


        if (!response.ok) {

            const result =
                await response.json();

            throw new Error(
                result.message ||
                "Unable to delete event."
            );

        }


        setDeletingEvent(null);

        await loadCalendar();

    };


    return (

        <div className="calendar-page">


            {/* =========================
                PAGE HEADER
            ========================= */}

            <div className="calendar-page-header">

                <div className="calendar-page-title">

                    <h2>
                        Calendar
                    </h2>

                    <p>
                        Manage laboratory schedules, activities, and room bookings.
                    </p>

                </div>

            </div>


            {/* ERROR */}

            {error && (
                <p className="form-error">
                    {error}
                </p>
            )}


            {/* =========================
                CALENDAR TOOLBAR
            ========================= */}

            <CalendarToolbar

                currentMonth={currentMonth}

                currentYear={currentYear}

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
                    openCreate
                }

            />


            {/* =========================
                CALENDAR CONTENT
            ========================= */}

            <div className="calendar-layout">

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
                        setSelectedDate
                    }

                    events={
                        events
                    }

                />


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
                            setSelectedDate
                        }

                        events={
                            events
                        }

                        onEdit={
                            openEdit
                        }

                        onDelete={
                            setDeletingEvent
                        }

                    />

                )}


                {calendarView === "Week" && (

                    <WeekView

                        events={events}

                        selectedDate={
                            selectedDate
                        }

                    />

                )}


                {calendarView === "Day" && (

                    <DayView

                        events={events}

                        selectedDate={
                            selectedDate
                        }

                    />

                )}


                {calendarView === "Schedule" && (

                    <ScheduleView
                        events={events}
                    />

                )}

            </div>


            {/* =========================
                MODALS
            ========================= */}

            <ActivityModal

                key={
                    editingEvent?.id ??
                    "new-event"
                }

                open={
                    openModal
                }

                onClose={() =>
                    setOpenModal(false)
                }

                onSave={
                    saveEvent
                }

                editEvent={
                    editingEvent
                }

                rooms={
                    rooms
                }

            />


            <DeleteModal

                key={
                    deletingEvent?.id ??
                    "delete-event"
                }

                open={
                    Boolean(deletingEvent)
                }

                event={
                    deletingEvent
                }

                onDelete={
                    deleteEvent
                }

                onClose={() =>
                    setDeletingEvent(null)
                }

            />

        </div>

    );
}
