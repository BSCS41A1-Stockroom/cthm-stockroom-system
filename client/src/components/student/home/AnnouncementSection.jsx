import { FaBullhorn, FaArrowRight } from "react-icons/fa";

const announcements = [
  {
    title: "Culinary Laboratory Schedule Updated",
    date: "July 28, 2026",
    description:
      "The Culinary Laboratory has been moved to Room CTHM-204 due to maintenance.",
  },
  {
    title: "Borrowing Deadline Reminder",
    date: "July 26, 2026",
    description:
      "Submit your borrowing request at least two days before your laboratory activity.",
  },
  {
    title: "New Kitchen Equipment Available",
    date: "July 24, 2026",
    description:
      "Stand mixers, induction cookers, and baking tools are now available for borrowing.",
  },
];

export default function AnnouncementSection() {
  return (
    <section className="announcement-section">

      <div className="announcement-header">

        <div>
          <h2>Announcements</h2>
          <p>Latest updates from the CTHM Stockroom</p>
        </div>

        <button className="view-all-btn">
          View All
          <FaArrowRight />
        </button>

      </div>

      <div className="announcement-list">

        {announcements.map((item, index) => (

          <div
            key={index}
            className="announcement-card"
          >

            <div className="announcement-icon">
              <FaBullhorn />
            </div>

            <div className="announcement-content">

              <span className="announcement-date">
                {item.date}
              </span>

              <h3>{item.title}</h3>

              <p>{item.description}</p>

            </div>

          </div>

        ))}

      </div>

    </section>
  );
}