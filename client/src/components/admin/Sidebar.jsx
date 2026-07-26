import { NavLink } from "react-router-dom";
import {
    FaTachometerAlt,
    FaBoxes,
    FaClipboardList,
    FaCalendarAlt,
    FaChartBar,
} from "react-icons/fa";

export default function Sidebar({
    sidebarOpen,
    setSidebarOpen,
    sidebarCollapsed,
}) {

    const menuItems = [
        {
            path: "/admin",
            icon: <FaTachometerAlt />,
            label: "Dashboard",
        },
        {
            path: "/admin/inventory",
            icon: <FaBoxes />,
            label: "Inventory",
        },
        {
            path: "/admin/requests",
            icon: <FaClipboardList />,
            label: "Borrow Requests",
        },
        {
            path: "/admin/calendar",
            icon: <FaCalendarAlt />,
            label: "Calendar",
        },
        {
            path: "/admin/reports",
            icon: <FaChartBar />,
            label: "Reports",
        },
    ];

    return (
        <>
            {sidebarOpen && (
                <div
                    className="overlay"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <aside
                className={`admin-sidebar
                    ${sidebarOpen ? "show" : ""}
                    ${sidebarCollapsed ? "collapsed" : ""}
                `}
            >

                <div className="admin-sidebar-header">
                    <div className="admin-logo">
                        📦
                    </div>

                    {!sidebarCollapsed && (
                        <div className="admin-logo-text">
                            <h2>CTHM</h2>
                            <span>Stockroom</span>
                        </div>
                    )}
                </div>

                <nav>

                    {menuItems.map((item) => (

                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === "/admin"}
                        >
                            {item.icon}

                            {!sidebarCollapsed && (
                                <span>
                                    {item.label}
                                </span>
                            )}

                        </NavLink>

                    ))}

                </nav>

            </aside>
        </>
    );

}