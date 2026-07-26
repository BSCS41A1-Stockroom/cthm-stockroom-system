import MiniCalendar from "./MiniCalendar";
import UpcomingEvents from "./UpcomingEvents";
import CalendarLegend from "./CalendarLegend";

export default function LeftSidebar({
  currentMonth,
  currentYear,
  selectedDate,
  setSelectedDate,
  events,
}) {
  return (
    <aside className="left-sidebar">

      <MiniCalendar
        currentMonth={currentMonth}
        currentYear={currentYear}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        events={events}
      />

      <UpcomingEvents events={events} />

      <CalendarLegend />

    </aside>
  );
}