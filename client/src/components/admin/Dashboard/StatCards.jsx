export default function StatCards() {

    const cards = [
        {
            title: "Total Items",
            value: 128,
            subtitle: "Total in Inventory",
        },
        {
            title: "Total Requests",
            value: 24,
            subtitle: "This Month",
        },
        {
            title: "Pending Requests",
            value: 5,
            subtitle: "For Approval",
        },
        {
            title: "Returned Today",
            value: 7,
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