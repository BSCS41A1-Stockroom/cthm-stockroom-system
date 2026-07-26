import ReportHeader from "../../components/admin/reports/ReportHeader";
import ReportStats from "../../components/admin/reports/ReportStats";
import MostBorrowedTable from "../../components/admin/reports/MostBorrowedTable";
import MonthlyBorrowingTable from "../../components/admin/reports/MonthlyBorrowingTable";

import "../../styles/reports.css";

export default function Reports() {
  return (
    <div className="reports-page">
      <ReportHeader />

      <ReportStats />

      <div className="reports-grid">
        <MostBorrowedTable />
        <MonthlyBorrowingTable />
      </div>
    </div>
  );
}