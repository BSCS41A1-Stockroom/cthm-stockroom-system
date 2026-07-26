export default function ScheduleView({
  events,
}) {

  const sorted = [...events].sort(
    (a, b) =>
      new Date(a.date) -
      new Date(b.date)
  );

  return (

    <div className="calendar-container">

      <table className="schedule-table">

        <thead>

          <tr>

            <th>Date</th>

            <th>Title</th>

            <th>Time</th>

            <th>Type</th>

            <th>Description</th>

          </tr>

        </thead>

        <tbody>

          {sorted.map(event => (

            <tr key={event.id}>

              <td>

                {event.date}

              </td>

              <td>

                {event.title}

              </td>

              <td>

                {event.start}

                {event.start && " - "}

                {event.end}

              </td>

              <td>

                <span
                  className={`event-chip ${event.type}`}
                >

                  {event.type}

                </span>

              </td>

              <td>

                {event.description || "-"}

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  );

}