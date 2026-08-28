import ReportHeader from "../../components/admin/reports/ReportHeader";
import ReportStats from "../../components/admin/reports/ReportStats";
import MostBorrowedTable from "../../components/admin/reports/MostBorrowedTable";
import MonthlyBorrowingTable from "../../components/admin/reports/MonthlyBorrowingTable";

import "../../styles/reports.css";
import { useState } from "react";
import { useReportData } from "../../hooks/useReportData";
import { reportCsv, reportPreset } from "../../utils/reporting";

export default function Reports() {
  const initialRange = reportPreset("year");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const { data, loading, error, refresh } = useReportData(from, to);

  function exportReport() {
    if (!data) return;
    const blob = new Blob([reportCsv(data)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cthm-stockroom-report-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="reports-page">
      <ReportHeader from={from} to={to} onFromChange={setFrom} onToChange={setTo}
        onPrint={() => window.print()} onExport={exportReport} exportDisabled={!data || loading} />

      {loading && !data && <p className="report-state">Loading report...</p>}
      {error && <p className="report-state error">{error} <button type="button" onClick={refresh}>Retry</button></p>}

      <ReportStats summary={data?.summary} />

      <div className="reports-grid">
        <MostBorrowedTable data={data?.mostBorrowed} />
        <MonthlyBorrowingTable months={data?.monthly} />
      </div>
    </div>
  );
}
