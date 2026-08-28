import RequestsLineChart from "./RequestsLineChart";

export default function RequestsOverview({ data }) {
    return (
        <div className="admin-card">

            <div className="card-header">
                <h3>Requests Overview</h3>
            </div>

            <RequestsLineChart data={data} />

        </div>
    );
}
