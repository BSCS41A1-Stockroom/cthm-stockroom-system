import {
  FaBoxOpen,
  FaCalendarAlt,
  FaClipboardList,
  FaArrowRight,
} from "react-icons/fa";

import { useNavigate } from "react-router-dom";

export default function FeatureCards() {
  const navigate = useNavigate();

  const cards = [
    {
      number: "01",
      icon: <FaBoxOpen />,
      title: "Borrow Equipment",
      description:
        "Browse available laboratory equipment and submit a borrowing request.",
      button: "Browse Equipment",
      path: "/borrowing",
    },
    {
      number: "02",
      icon: <FaCalendarAlt />,
      title: "View Calendar",
      description:
        "Review laboratory activities, reservations, schedules, and important dates.",
      button: "Open Calendar",
      path: "/calendar",
    },
    {
      number: "03",
      icon: <FaClipboardList />,
      title: "My Requests",
      description:
        "Monitor your borrowing requests and check their current approval status.",
      button: "View Requests",
      path: "/requests",
    },
  ];

  return (
    <section className="feature-section">
      <div className="section-heading">
        <div>
          <span>QUICK ACCESS</span>
          <h2>What would you like to do?</h2>
        </div>

        <p>
          Access the stockroom services you need.
        </p>
      </div>

      <div className="feature-grid">
        {cards.map((card) => (
          <article
            className="feature-card"
            key={card.number}
          >
            <div className="feature-top">
              <span className="feature-number">
                {card.number}
              </span>

              <div className="feature-icon">
                {card.icon}
              </div>
            </div>

            <div className="feature-body">
              <h3>{card.title}</h3>

              <p>{card.description}</p>
            </div>

            <button
              className="feature-button"
              onClick={() => navigate(card.path)}
            >
              {card.button}
              <FaArrowRight />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}