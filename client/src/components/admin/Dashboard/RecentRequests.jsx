export default function RecentRequests() {

    const requests = [

        {
            id:"BR-2025-0015",
            item:"Microphone",
            status:"Pending",
        },

        {
            id:"BR-2025-0016",
            item:"Projector",
            status:"Approved",
        },

        {
            id:"BR-2025-0017",
            item:"Canon Camera",
            status:"Returned",
        },

        {
            id:"BR-2025-0018",
            item:"Tripod",
            status:"Pending",
        },

    ];

    return (

        <div className="admin-card">

            <div className="card-header">

                <h3>Recent Requests</h3>

            </div>

            <table className="recent-table">

                <tbody>

                {requests.map((request,index)=>(

                    <tr key={index}>

                        <td>{request.id}</td>

                        <td>{request.item}</td>

                        <td>

                            <span
                                className={`status ${request.status.toLowerCase()}`}
                            >
                                {request.status}
                            </span>

                        </td>

                    </tr>

                ))}

                </tbody>

            </table>

        </div>

    );

}