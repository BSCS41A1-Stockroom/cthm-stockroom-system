export default function StatCards({ summary = {} }) {

    const cards = [
        {
            title: "Available Inventory",
            value: summary.available_inventory_units ?? 0,
            subtitle: "Available Units",
        },
        {
            title: "Total Requests",
            value: summary.total_borrowings ?? 0,
            subtitle: "Selected Period",
        },
        {
            title: "Pending Requests",
            value: summary.pending_requests ?? 0,
            subtitle: "For Approval",
        },
        {
            title: "Returned Today",
            value: summary.returned_today ?? 0,
            subtitle: "Items",
        },
    ];

    return (

        <div className="stats-grid">

            {cards.map((card, index) => (

                <div
                    key={index}
                    className="stat-card"
                >

                    <span>{card.title}</span>

                    <h2>{card.value}</h2>

                    <small>{card.subtitle}</small>

                </div>

            ))}

        </div>

    );

}
