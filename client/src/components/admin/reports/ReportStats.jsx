import {
  FaClipboardList,
  FaBoxOpen,
  FaUsers,
  FaUndo
} from "react-icons/fa";

export default function ReportStats({ summary = {} }) {
  const cards = [
    { title: "Total Borrowings", value: summary.total_borrowings ?? 0, icon: <FaClipboardList /> },
    { title: "Returned Units", value: summary.returned_units ?? 0, icon: <FaUndo /> },
    { title: "Borrowed Units", value: summary.borrowed_units ?? 0, icon: <FaBoxOpen /> },
    { title: "Active Borrowers", value: summary.active_borrowers ?? 0, icon: <FaUsers /> },
  ];
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
