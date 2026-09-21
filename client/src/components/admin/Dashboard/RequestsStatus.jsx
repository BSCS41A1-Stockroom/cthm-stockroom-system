import { lazy, Suspense } from "react";

const RequestsPieChart = lazy(() => import("./RequestsPieChart"));

export default function RequestsStatus({ data }) {
    return (
        <div className="admin-card">

            <div className="card-header">
                <h3>Requests by Status</h3>
            </div>

            <Suspense fallback={<div className="dashboard-chart-loading" role="status">Loading chart...</div>}>
                <RequestsPieChart data={data} />
            </Suspense>

        </div>
    );
}
