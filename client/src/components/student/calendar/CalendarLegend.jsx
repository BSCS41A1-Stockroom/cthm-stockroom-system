export default function CalendarLegend(){

    return(

        <div className="sidebar-card">

            <h3>Legend</h3>

            <div className="legend-row">
                <span className="legend-dot available"></span>
                Available
            </div>

            <div className="legend-row">
                <span className="legend-dot activity"></span>
                School Activity
            </div>

            <div className="legend-row">
                <span className="legend-dot holiday"></span>
                Holiday
            </div>

            <div className="legend-row">
                <span className="legend-dot reminder"></span>
                Borrow Reminder
            </div>

            <div className="legend-row"><span className="legend-dot borrowing"></span>Borrowed</div>
            <div className="legend-row"><span className="legend-dot return_due"></span>Return Due</div>
            <div className="legend-row"><span className="legend-dot return_completed"></span>Returned</div>

        </div>

    );

}
