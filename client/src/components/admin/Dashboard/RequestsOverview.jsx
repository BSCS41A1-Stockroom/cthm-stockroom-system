import { lazy, Suspense } from "react";

const RequestsLineChart = lazy(() => import("./RequestsLineChart"));

export default function RequestsOverview({ data }) {
    return (
        <div className="admin-card">

            <div className="card-header">
                <h3>Requests Overview</h3>
            </div>

            <Suspense fallback={<div className="dashboard-chart-loading" role="status">Loading chart...</div>}>
                <RequestsLineChart data={data} />
            </Suspense>

        </div>
    );
}
