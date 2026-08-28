import RequestsPieChart from "./RequestsPieChart";

export default function RequestsStatus({ data }) {
    return (
        <div className="admin-card">

            <div className="card-header">
                <h3>Requests by Status</h3>
            </div>

            <RequestsPieChart data={data} />

        </div>
    );
}
