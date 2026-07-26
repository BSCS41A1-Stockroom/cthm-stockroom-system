const events = [
  {
    time: "9:00 AM",
    title: "Culinary Laboratory",
    type: "activity",
  },
  {
    time: "10:00 AM",
    title: "Borrow Equipment",
    type: "reminder",
  },
  {
    time: "1:00 PM",
    title: "School Holiday",
    type: "holiday",
  },
];

const hours = [];

for (let i = 7; i <= 18; i++) {
  const hour = i > 12 ? i - 12 : i;
  const suffix = i >= 12 ? "PM" : "AM";
  hours.push(`${hour}:00 ${suffix}`);
}

export default function DayView() {
  return (
    <div className="week-container">

      <div className="week-header">

        <div className="time-column"></div>

        <div
          className="week-day"
          style={{ gridColumn: "span 7" }}
        >
          Monday • July 27
        </div>

      </div>

      <div className="week-body">

        {hours.map((hour) => (
          <>
            <div key={hour} className="week-time">
              {hour}
            </div>

            <div
              key={`${hour}-cell`}
              className="week-cell"
              style={{ gridColumn: "span 7" }}
            >
              {events
                .filter((e) => e.time === hour)
                .map((event) => (
                  <div
                    key={event.title}
                    className={`week-event ${event.type}`}
                  >
                    {event.title}
                  </div>
                ))}
            </div>
          </>
        ))}

      </div>

    </div>
  );
}