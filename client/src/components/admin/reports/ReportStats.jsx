import {
  FaClipboardList,
  FaBoxOpen,
  FaUsers,
  FaUndo
} from "react-icons/fa";
import { FaScrewdriverWrench, FaTriangleExclamation } from "react-icons/fa6";

export default function ReportStats({ summary = {} }) {
  const cards = [
    { title: "Total Borrowings", value: summary.total_borrowings ?? 0, icon: <FaClipboardList /> },
    { title: "Returned Units", value: summary.returned_units ?? 0, icon: <FaUndo /> },
    { title: "Borrowed Units", value: summary.borrowed_units ?? 0, icon: <FaBoxOpen /> },
    { title: "Active Borrowers", value: summary.active_borrowers ?? 0, icon: <FaUsers /> },
    { title: "Open Maintenance", value: summary.open_maintenance_cases ?? 0, icon: <FaScrewdriverWrench /> },
    { title: "Overdue Maintenance", value: summary.overdue_maintenance_cases ?? 0, icon: <FaTriangleExclamation /> },
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
