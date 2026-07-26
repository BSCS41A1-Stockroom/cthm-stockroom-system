const hours = [];

for (let i = 7; i <= 20; i++) {
  hours.push(`${i}:00`);
}

export default function DayView() {

  return (

    <div className="calendar-container">

      <h2 className="view-title">

        Day Schedule

      </h2>

      <div className="day-view">

        {hours.map(hour => (

          <div
            key={hour}
            className="day-row"
          >

            <div className="day-hour">

              {hour}

            </div>

            <div className="day-slot"></div>

          </div>

        ))}

      </div>

    </div>

  );

}