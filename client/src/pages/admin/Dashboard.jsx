import "../../styles/admin.css";

import DashboardHeader from "../../components/admin/Dashboard/DashboardHeader";
import StatCards from "../../components/admin/Dashboard/StatCards";

import RequestsOverview from "../../components/admin/Dashboard/RequestsOverview";
import RequestsStatus from "../../components/admin/Dashboard/RequestsStatus";

import RecentRequests from "../../components/admin/Dashboard/RecentRequests";
import LowStockAlerts from "../../components/admin/Dashboard/LowStockAlerts";

export default function Dashboard() {

    return (

        <div className="dashboard-page">

            <DashboardHeader />

            <StatCards />

            <div className="dashboard-grid">

                <RequestsOverview />

                <RequestsStatus />

            </div>

            <div className="dashboard-grid">

                <RecentRequests />

                <LowStockAlerts />

            </div>

        </div>

    );

}