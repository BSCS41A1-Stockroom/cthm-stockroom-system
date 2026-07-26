import { useState } from "react";

import "../../styles/calendar.css";

import CalendarToolbar from "../../components/admin/Calendar/CalendarToolbar";
import LeftSidebar from "../../components/admin/Calendar/LeftSidebar";

import MonthView from "../../components/admin/Calendar/MonthView";
import WeekView from "../../components/admin/Calendar/WeekView";
import DayView from "../../components/admin/Calendar/DayView";
import ScheduleView from "../../components/admin/Calendar/ScheduleView";

import ActivityModal from "../../components/admin/Calendar/ActivityModal";

export default function Calendar() {

    const today = new Date();

    const [currentMonth, setCurrentMonth] = useState(today.getMonth());
    const [currentYear, setCurrentYear] = useState(today.getFullYear());

    const [selectedDate, setSelectedDate] = useState(today);

    const [calendarView, setCalendarView] = useState("Month");

    const [openModal, setOpenModal] = useState(false);

    const [events, setEvents] = useState([
        {
            id: 1,
            title: "Faculty Meeting",
            date: "2026-07-28",
            start: "08:00",
            end: "10:00",
            type: "activity",
            description: "Monthly faculty meeting"
        },
        {
            id: 2,
            title: "National Heroes Day",
            date: "2026-08-31",
            start: "",
            end: "",
            type: "holiday",
            description: ""
        },
        {
            id: 3,
            title: "Kitchen Laboratory",
            date: "2026-07-30",
            start: "09:00",
            end: "12:00",
            type: "reminder",
            description: "Borrowing Schedule"
        }
    ]);

    return (

        <div className="calendar-page">

            <CalendarToolbar

                currentMonth={currentMonth}
                currentYear={currentYear}

                setCurrentMonth={setCurrentMonth}
                setCurrentYear={setCurrentYear}

                calendarView={calendarView}
                setCalendarView={setCalendarView}

                onAdd={() => setOpenModal(true)}

            />

            <div className="calendar-layout">

                <LeftSidebar

                    currentMonth={currentMonth}
                    currentYear={currentYear}

                    selectedDate={selectedDate}
                    setSelectedDate={setSelectedDate}

                    events={events}

                />

                {calendarView === "Month" && (

                    <MonthView

                        currentMonth={currentMonth}
                        currentYear={currentYear}

                        selectedDate={selectedDate}
                        setSelectedDate={setSelectedDate}

                        events={events}

                        onEdit={(event) => console.log(event)}

                        onDelete={(event) => console.log(event)}

                    />

                )}

                {calendarView === "Week" && (

                    <WeekView />

                )}

                {calendarView === "Day" && (

                    <DayView />

                )}

                {calendarView === "Schedule" && (

                    <ScheduleView

                        events={events}

                    />

                )}

            </div>

            <ActivityModal

                open={openModal}

                onClose={() => setOpenModal(false)}

                events={events}

                setEvents={setEvents}

            />

        </div>

    );

}