export default function DashboardHeader({ range, onRangeChange }) {
    return (
        <div className="dashboard-header">

            <div>

                <h1>Dashboard</h1>

                <p>
                    Overview of stockroom activities and requests.
                </p>

            </div>

            <select className="dashboard-range" value={range} onChange={(event) => onRangeChange(event.target.value)}>
                <option value="week">Last 7 Days</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>

            </select>

        </div>
    );
}
