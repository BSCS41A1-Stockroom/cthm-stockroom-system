import { calendarEvents } from "../../../data/calendarEvents";
import "../../../styles/calendar.css";

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const hours = [];

for (let i = 7; i <= 18; i++) {
  hours.push(`${i}:00`);
}

export default function WeekView() {
  return (
    <div className="week-container">

      <div className="week-header">

        <div className="time-column"></div>

        {days.map((day) => (
          <div key={day} className="week-day">
            {day}
          </div>
        ))}

      </div>

      <div className="week-body">

        {hours.map((hour) => (

          <>

            <div className="week-time">
              {hour}
            </div>

            {days.map((day, index) => (

              <div
                key={`${hour}-${index}`}
                className="week-cell"
              >

                {hour === "9:00" && index === 1 && (
                  <div className="week-event activity">
                    Culinary Laboratory
                  </div>
                )}

                {hour === "10:00" && index === 2 && (
                  <div className="week-event reminder">
                    Borrow Equipment
                  </div>
                )}

                {hour === "13:00" && index === 4 && (
                  <div className="week-event holiday">
                    School Holiday
                  </div>
                )}

              </div>

            ))}

          </>

        ))}

      </div>

    </div>
  );
}