import { Fragment } from "react";

const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const hours = [];

for (let i = 7; i <= 18; i++) {
  const hour = i > 12 ? i - 12 : i;
  const suffix = i >= 12 ? "PM" : "AM";
  hours.push(`${hour}:00 ${suffix}`);
}

export default function WeekView() {
  return (
    <div className="week-container">

      <div className="week-header">
        <div className="time-column"></div>

        {days.map((day) => (
          <div key={day} className="week-day">
            <span>{day.slice(0,3)}</span>
          </div>
        ))}
      </div>

      <div className="week-body">

        {hours.map((hour) => (
          <Fragment key={hour}>

            <div className="week-time">
              {hour}
            </div>

            {days.map((day, index) => (
              <div
                key={`${hour}-${day}`}
                className="week-cell"
              >

                {hour === "9:00 AM" && index === 1 && (
                  <div className="week-event activity">
                    Culinary Laboratory
                  </div>
                )}

                {hour === "10:00 AM" && index === 2 && (
                  <div className="week-event reminder">
                    Borrow Equipment
                  </div>
                )}

                {hour === "1:00 PM" && index === 4 && (
                  <div className="week-event holiday">
                    School Holiday
                  </div>
                )}

              </div>
            ))}

          </Fragment>
        ))}

      </div>

    </div>
  );
}