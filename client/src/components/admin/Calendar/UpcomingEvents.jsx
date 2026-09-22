import { getUpcomingEvents } from "../../../utils/calendarUtils";

export default function UpcomingEvents({ events }) {

    const upcoming = getUpcomingEvents(events);

    return (

        <div className="sidebar-card">

            <h3>Upcoming Events</h3>

            {upcoming.map(event => (

                <div
                    key={event.id}
                    className="upcoming-item"
                >

                    <span className={`event-dot ${event.type}`}></span>

                    <div>

                        <strong>{event.title}</strong>

                        <p>{event.date}</p>

                    </div>

                </div>

            ))}

            {upcoming.length === 0 && (

                <p>No upcoming events.</p>

            )}

        </div>

    );

}
