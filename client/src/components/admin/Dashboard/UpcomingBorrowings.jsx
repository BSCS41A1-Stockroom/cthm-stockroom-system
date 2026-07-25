export default function UpcomingBorrowings(){

    const data=[

        {
            date:"July 27",
            activity:"Kitchen Laboratory",
            items:12,
        },

        {
            date:"July 29",
            activity:"Baking Laboratory",
            items:8,
        },

        {
            date:"July 30",
            activity:"Restaurant Service",
            items:16,
        },

    ];

    return(

        <div className="admin-card">

            <div className="card-header">

                <h3>
                    Upcoming Borrowings
                </h3>

            </div>

            {data.map((borrow,index)=>(

                <div
                    key={index}
                    className="borrow-item"
                >

                    <div>

                        <strong>
                            {borrow.activity}
                        </strong>

                        <p>
                            {borrow.date}
                        </p>

                    </div>

                    <span>

                        {borrow.items} Items

                    </span>

                </div>

            ))}

        </div>

    );

}