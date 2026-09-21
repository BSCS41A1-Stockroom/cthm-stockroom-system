// Sidebar.jsx

import { NavLink } from "react-router-dom";
import {
    FaHome,
    FaBoxOpen,
    FaCalendarAlt,
    FaClipboardList,
    FaQrcode,
    FaShieldAlt,
    FaTimes,
} from "react-icons/fa";

const STUDENT_NAV = [
    {
        to: "/",
        label: "Home",
        icon: FaHome,
        end: true,
    },
    {
        to: "/borrowing",
        label: "Borrowing",
        icon: FaBoxOpen,
    },
    {
        to: "/calendar",
        label: "Calendar",
        icon: FaCalendarAlt,
    },
    {
        to: "/my-requests",
        label: "My Requests",
        icon: FaClipboardList,
    },
    {
        to: "/my-accountability",
        label: "Accountability",
        icon: FaShieldAlt,
    },
];

const PROFESSOR_NAV = [
    {
        to: "/professor",
        label: "Dashboard",
        icon: FaHome,
        end: true,
    },
    {
        to: "/professor/qr",
        label: "QR Scanner",
        icon: FaQrcode,
    },
    {
        to: "/professor/calendar",
        label: "Calendar",
        icon: FaCalendarAlt,
    },
    {
        to: "/professor/requests",
        label: "Pending Requests",
        icon: FaClipboardList,
    },
];

export default function Sidebar({
    sidebarOpen,
    setSidebarOpen,
    sidebarCollapsed,
    variant = "student",
}) {
    const isProfessor = variant === "professor";

    const navigation = isProfessor
        ? PROFESSOR_NAV
        : STUDENT_NAV;

    const closeSidebar = () => {
        setSidebarOpen(false);
    };

    return (
        <>
            {sidebarOpen && (
                <div
                    className="sidebar-overlay"
                    onClick={closeSidebar}
                    aria-hidden="true"
                />
            )}

            <aside
                className={[
                    "sidebar",
                    sidebarOpen ? "sidebar--open" : "",
                    sidebarCollapsed
                        ? "sidebar--collapsed"
                        : "",
                ]
                    .filter(Boolean)
                    .join(" ")}
            >
                {/* BRAND */}
                <div className="sidebar-brand">
                    <div className="sidebar-brand-mark">
                        C
                    </div>

                    <div className="sidebar-brand-text">
                        <strong>CTHM</strong>
                        <span>STOCK ROOM</span>
                    </div>

                    <button
                        type="button"
                        className="sidebar-mobile-close"
                        onClick={closeSidebar}
                        aria-label="Close navigation"
                    >
                        <FaTimes />
                    </button>
                </div>

                {/* NAVIGATION */}
                <nav className="sidebar-nav">
                    {navigation.map((item) => {
                        const Icon = item.icon;

                        return (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={({ isActive }) =>
                                    [
                                        "sidebar-nav-link",
                                        isActive
                                            ? "active"
                                            : "",
                                    ]
                                        .filter(Boolean)
                                        .join(" ")
                                }
                                onClick={closeSidebar}
                            >
                                <span className="sidebar-nav-icon">
                                    <Icon />
                                </span>

                                <span className="sidebar-nav-label">
                                    {item.label}
                                </span>
                            </NavLink>
                        );
                    })}
                </nav>

                {/* BOTTOM */}
                <div className="sidebar-bottom">
                    <div className="sidebar-bottom-content">
                        <div className="sidebar-bottom-label">
                            CTHM STOCK ROOM
                        </div>

                        <div className="sidebar-bottom-version">
                            Academic Inventory System
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
}
