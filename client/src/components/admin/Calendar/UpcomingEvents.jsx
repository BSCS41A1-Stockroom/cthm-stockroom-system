export default function UpcomingEvents({ events }) {

    const upcoming = [...events]
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 5);

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