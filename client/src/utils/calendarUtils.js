import { calendarEvents } from "../data/calendarEvents";

export function formatDate(date) {
  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getEvents(date) {
  return calendarEvents.filter(
    (event) => event.date === formatDate(date)
  );
}

export function isHoliday(date) {
  return getEvents(date).some(
    (event) => event.type === "holiday"
  );
}

export function isToday(date) {
  const today = new Date();

  return (
    today.getDate() === date.getDate() &&
    today.getMonth() === date.getMonth() &&
    today.getFullYear() === date.getFullYear()
  );
}

export function isSunday(date) {
  return date.getDay() === 0;
}