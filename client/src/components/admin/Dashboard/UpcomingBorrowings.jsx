export default function UpcomingBorrowings({ data = [] }){

    return(

        <div className="admin-card">

            <div className="card-header">

                <h3>
                    Upcoming Borrowings
                </h3>

            </div>

            {data.map((borrow)=>(

                <div
                    key={borrow.id}
                    className="borrow-item"
                >

                    <div>

                        <strong>
                            {borrow.purpose || "Equipment borrowing"}
                        </strong>

                        <p>
                            {new Date(`${borrow.borrow_date}T00:00:00`).toLocaleDateString()}
                        </p>

                    </div>

                    <span>

                        {borrow.units} Units

                    </span>

                </div>

            ))}

            {data.length === 0 && <p className="dashboard-state">No upcoming approved borrowings.</p>}

        </div>

    );

}
