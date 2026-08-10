import { useCallback, useEffect, useState } from "react";

import "../../styles/calendar.css";

import CalendarToolbar from "../../components/student/calendar/CalendarToolbar";
import LeftSidebar from "../../components/student/calendar/LeftSidebar";

import MonthView from "../../components/student/calendar/MonthView";
import WeekView from "../../components/student/calendar/WeekView";
import DayView from "../../components/student/calendar/DayView";
import ScheduleView from "../../components/student/calendar/ScheduleView";
import { supabase } from "../../lib/supabase";

export default function Calendar() {

  const today = new Date();

  const [currentMonth, setCurrentMonth] = useState(today.getMonth());

  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  const [selectedDate, setSelectedDate] = useState(today);

  const [calendarView, setCalendarView] = useState("Month");

  const [events, setEvents] = useState([]);

  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .order("event_date");
    if (!error) {
      setEvents((data || []).map((event) => ({
        id: event.id,
        title: event.title,
        date: event.event_date,
        start: event.start_time?.slice(0, 5) || "",
        end: event.end_time?.slice(0, 5) || "",
        type: event.event_type === "borrowing" ? "reminder" : event.event_type,
        description: event.description || "",
      })));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadEvents, 0);
    const channel = supabase
      .channel("student-calendar-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events" }, loadEvents)
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [loadEvents]);

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
          events={events}
      />

        {calendarView === "Month" && (

            <MonthView
                currentMonth={currentMonth}
                currentYear={currentYear}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                events={events}
            />

        )}

        {calendarView === "Week" && (

            <WeekView
                selectedDate={selectedDate}
                events={events}
            />

        )}

        {calendarView === "Day" && (

            <DayView
                selectedDate={selectedDate}
                events={events}
            />

        )}

        {calendarView === "Schedule" && (

            <ScheduleView events={events} />

        )}

      </div>

    </div>

  );

}
