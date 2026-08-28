import "../../styles/admin.css";

import DashboardHeader from "../../components/admin/Dashboard/DashboardHeader";
import StatCards from "../../components/admin/Dashboard/StatCards";

import RequestsOverview from "../../components/admin/Dashboard/RequestsOverview";
import RequestsStatus from "../../components/admin/Dashboard/RequestsStatus";

import RecentRequests from "../../components/admin/Dashboard/RecentRequests";
import LowStockAlerts from "../../components/admin/Dashboard/LowStockAlerts";
import UpcomingBorrowings from "../../components/admin/Dashboard/UpcomingBorrowings";
import { useState } from "react";
import { reportPreset } from "../../utils/reporting";
import { useReportData } from "../../hooks/useReportData";

export default function Dashboard() {
    const [rangeName, setRangeName] = useState("month");
    const range = reportPreset(rangeName);
    const { data, loading, error, refresh } = useReportData(range.from, range.to);

    return (

        <div className="dashboard-page">

            <DashboardHeader range={rangeName} onRangeChange={setRangeName} />

            {error && <div className="dashboard-state error">{error} <button type="button" onClick={refresh}>Retry</button></div>}
            {loading && !data && <div className="dashboard-state">Loading dashboard...</div>}

            <StatCards summary={data?.summary} />

            <div className="dashboard-grid">

                <RequestsOverview data={data?.monthly} />

                <RequestsStatus data={data?.statuses} />

            </div>

            <div className="dashboard-grid">

                <RecentRequests requests={data?.recentRequests} />

                <LowStockAlerts />

            </div>

            <UpcomingBorrowings data={data?.upcomingBorrowings} />

        </div>

    );

}
