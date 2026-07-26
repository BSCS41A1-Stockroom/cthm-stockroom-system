const weekDays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const hours = [];

for (let i = 7; i <= 20; i++) {
  hours.push(`${i}:00`);
}

export default function WeekView() {

  return (

    <div className="calendar-container week-view">

      <div className="week-header">

        <div className="time-column"></div>

        {weekDays.map(day => (

          <div
            key={day}
            className="week-day-header"
          >
            {day}
          </div>

        ))}

      </div>

      <div className="week-body">

        {hours.map(hour => (

          <div
            key={hour}
            className="week-row"
          >

            <div className="week-time">

              {hour}

            </div>

            {weekDays.map(day => (

              <div
                key={day}
                className="week-cell"
              ></div>

            ))}

          </div>

        ))}

      </div>

    </div>

  );

}