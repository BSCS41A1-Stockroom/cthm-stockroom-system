import {
  FaPrint,
  FaDownload
} from "react-icons/fa";

export default function ReportHeader() {
  return (
    <div className="reports-header">
      <div>
        <h2>Reports</h2>
        <p>
          Borrowing activities and inventory usage summary.
        </p>
      </div>

      <div className="reports-actions">
        <button className="print-btn">
          <FaPrint />
          Print Report
        </button>

        <button className="export-btn">
          <FaDownload />
          Export
        </button>
      </div>
    </div>
  );
}