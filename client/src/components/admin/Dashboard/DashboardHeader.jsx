export default function DashboardHeader() {
    return (
        <div className="dashboard-header">

            <div>

                <h1>Dashboard</h1>

                <p>
                    Overview of stockroom activities and requests.
                </p>

            </div>

            <select className="dashboard-range">

                <option>May 1 - May 20, 2025</option>
                <option>This Week</option>
                <option>This Month</option>
                <option>This Year</option>

            </select>

        </div>
    );
}