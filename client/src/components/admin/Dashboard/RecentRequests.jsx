export default function RecentRequests({ requests = [] }) {

    return (

        <div className="admin-card">

            <div className="card-header">

                <h3>Recent Requests</h3>

            </div>

            <table className="recent-table">

                <tbody>

                {requests.map((request)=>(

                    <tr key={request.id}>

                        <td>BR-{String(request.id).padStart(3, "0")}</td>

                        <td>{request.items}</td>

                        <td>

                            <span
                                className={`status ${request.status.toLowerCase()}`}
                            >
                                {request.status}
                            </span>

                        </td>

                    </tr>

                ))}

                {requests.length === 0 && <tr><td colSpan="3">No requests in this period.</td></tr>}

                </tbody>

            </table>

        </div>

    );

}
