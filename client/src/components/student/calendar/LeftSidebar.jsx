import MiniCalendar from "./MiniCalendar";
import UpcomingEvents from "./UpcomingEvents";
import CalendarLegend from "./CalendarLegend";

export default function LeftSidebar({
    currentMonth,
    currentYear,
    selectedDate,
    setSelectedDate,
}) {
  return (
    <aside className="left-sidebar">

    <MiniCalendar
        currentMonth={currentMonth}
        currentYear={currentYear}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
    />

      <UpcomingEvents />

      <CalendarLegend />

    </aside>
  );
}