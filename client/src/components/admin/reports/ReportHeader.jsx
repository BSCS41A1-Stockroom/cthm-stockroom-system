import {
  FaPrint,
  FaDownload
} from "react-icons/fa";

export default function ReportHeader({ from, to, onFromChange, onToChange, onPrint, onExport, exportDisabled }) {
  return (
    <div className="reports-header">
      <div>
        <h2>Reports</h2>
        <p>
          Borrowing activities and inventory usage summary.
        </p>
        <p className="report-period">Reporting period: {from} to {to}</p>
      </div>

      <div className="reports-actions">
        <label>From<input type="date" required value={from} max={to} onChange={(event) => {
          if (event.target.value) onFromChange(event.target.value);
        }} /></label>
        <label>To<input type="date" required value={to} min={from} onChange={(event) => {
          if (event.target.value) onToChange(event.target.value);
        }} /></label>
        <button type="button" className="print-btn" onClick={onPrint} disabled={exportDisabled}>
          <FaPrint />
          Print Report
        </button>

        <button type="button" className="export-btn" onClick={onExport} disabled={exportDisabled}>
          <FaDownload />
          Export
        </button>
      </div>
    </div>
  );
}
