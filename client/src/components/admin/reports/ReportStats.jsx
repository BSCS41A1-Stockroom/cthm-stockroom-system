import {
  FaClipboardList,
  FaBoxOpen,
  FaUsers,
  FaUndo
} from "react-icons/fa";

const cards = [
  {
    title: "Total Borrowings",
    value: 184,
    icon: <FaClipboardList />
  },
  {
    title: "Returned Items",
    value: 162,
    icon: <FaUndo />
  },
  {
    title: "Borrowed Items",
    value: 37,
    icon: <FaBoxOpen />
  },
  {
    title: "Active Borrowers",
    value: 28,
    icon: <FaUsers />
  }
];

export default function ReportStats() {
  return (
    <div className="report-stats">
      {cards.map((card) => (
        <div
          key={card.title}
          className="report-card"
        >
          <div className="report-icon">
            {card.icon}
          </div>

          <div>
            <h3>{card.value}</h3>
            <p>{card.title}</p>
          </div>
        </div>
      ))}
    </div>
  );
}