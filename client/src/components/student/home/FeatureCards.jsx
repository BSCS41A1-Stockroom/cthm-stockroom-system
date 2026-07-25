import {
  FaBoxOpen,
  FaCalendarAlt,
  FaClipboardList,
} from "react-icons/fa";

export default function FeatureCards() {

  const cards = [
    {
      icon: <FaBoxOpen />,
      title: "Borrow Equipment",
      description:
        "Browse available items and submit a borrow request.",
      button: "Go to Borrowing",
    },
    {
      icon: <FaCalendarAlt />,
      title: "View Calendar",
      description:
        "Check schedules, activities, and holidays.",
      button: "Go to Calendar",
    },
    {
      icon: <FaClipboardList />,
      title: "My Requests",
      description:
        "Track your borrowing requests and their status.",
      button: "View Requests",
    },
  ];

  return (
    <section className="feature-section">

      {cards.map((card, index) => (

        <div
          className="feature-card"
          key={index}
        >

          <div className="feature-icon">
            {card.icon}
          </div>

          <h3>{card.title}</h3>

          <p>{card.description}</p>

          <button>
            {card.button}
          </button>

        </div>

      ))}

    </section>
  );
}