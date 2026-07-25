import {
    FaPlus,
    FaClipboardCheck,
    FaBoxes,
    FaFileAlt,
} from "react-icons/fa";

export default function QuickActions() {

    const actions = [

        {
            icon:<FaPlus />,
            title:"Add Item",
        },

        {
            icon:<FaClipboardCheck />,
            title:"Approve Requests",
        },

        {
            icon:<FaBoxes />,
            title:"Inventory",
        },

        {
            icon:<FaFileAlt />,
            title:"Reports",
        },

    ];

    return (

        <div className="admin-card">

            <div className="card-header">

                <h3>Quick Actions</h3>

            </div>

            <div className="quick-actions">

                {actions.map((action,index)=>(

                    <button
                        key={index}
                        className="quick-btn"
                    >

                        {action.icon}

                        <span>
                            {action.title}
                        </span>

                    </button>

                ))}

            </div>

        </div>

    );

}