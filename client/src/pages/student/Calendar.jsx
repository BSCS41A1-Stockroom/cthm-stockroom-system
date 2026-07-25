import { useState } from "react";

import "../../styles/calendar.css";

import CalendarToolbar from "../../components/student/calendar/CalendarToolbar";
import LeftSidebar from "../../components/student/calendar/LeftSidebar";

import MonthView from "../../components/student/calendar/MonthView";
import WeekView from "../../components/student/calendar/WeekView";
import DayView from "../../components/student/calendar/DayView";
import ScheduleView from "../../components/student/calendar/ScheduleView";

export default function Calendar() {

  const today = new Date();

  const [currentMonth, setCurrentMonth] = useState(today.getMonth());

  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  const [selectedDate, setSelectedDate] = useState(today);

  const [calendarView, setCalendarView] = useState("Month");

  return (

    <div className="calendar-page">

      <CalendarToolbar
          currentMonth={currentMonth}
          currentYear={currentYear}
          setCurrentMonth={setCurrentMonth}
          setCurrentYear={setCurrentYear}

          calendarView={calendarView}
          setCalendarView={setCalendarView}
      />

      <div className="calendar-layout">

      <LeftSidebar
          currentMonth={currentMonth}
          currentYear={currentYear}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
      />

        {calendarView === "Month" && (

            <MonthView
                currentMonth={currentMonth}
                currentYear={currentYear}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
            />

        )}

        {calendarView === "Week" && (

            <WeekView
                selectedDate={selectedDate}
            />

        )}

        {calendarView === "Day" && (

            <DayView
                selectedDate={selectedDate}
            />

        )}

        {calendarView === "Schedule" && (

            <ScheduleView />

        )}

      </div>

    </div>

  );

}