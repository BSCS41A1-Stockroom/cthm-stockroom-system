import { NavLink, Outlet } from "react-router-dom";
import {
    FaHome,
    FaQrcode,
    FaCalendarAlt,
    FaClipboardList,
    FaSignOutAlt,
    FaBars,
    FaTimes,
    FaSignature,
} from "react-icons/fa";
import { useState } from "react";
import { useAuth } from "../auth/useAuth";

import "../styles/professor.css";

export default function ProfessorLayout() {
    const { profile, signOut } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleLogout = async () => {
        await signOut();
    };

    const closeSidebar = () => {
        setSidebarOpen(false);
    };

    return (
        <div className="professor-layout">

            {/* MOBILE OVERLAY */}
            {sidebarOpen && (
                <div
                    className="professor-sidebar-overlay"
                    onClick={closeSidebar}
                />
            )}

            {/* SIDEBAR */}
            <aside
                className={`professor-sidebar ${
                    sidebarOpen
                        ? "professor-sidebar--open"
                        : ""
                }`}
            >
                <div className="professor-brand">
                    <div className="professor-brand-mark">
                        C
                    </div>

                    <div className="professor-brand-text">
                        <strong>CTHM</strong>
                        <span>STOCK ROOM</span>
                    </div>

                    <button
                        type="button"
                        className="professor-mobile-close"
                        onClick={closeSidebar}
                        aria-label="Close navigation"
                    >
                        <FaTimes />
                    </button>
                </div>

                <div className="professor-portal-label">
                    PROFESSOR PORTAL
                </div>

                <nav className="professor-nav">

                    <NavLink
                        to="/professor"
                        end
                        className={({ isActive }) =>
                            `professor-nav-link ${
                                isActive
                                    ? "active"
                                    : ""
                            }`
                        }
                        onClick={closeSidebar}
                    >
                        <FaHome />
                        <span>Dashboard</span>
                    </NavLink>

                    <NavLink to="/professor/signature" className={({ isActive }) => `professor-nav-link ${isActive ? "active" : ""}`} onClick={closeSidebar}>
                        <FaSignature />
                        <span>Signature Settings</span>
                    </NavLink>

                    <NavLink
                        to="/professor/qr"
                        className={({ isActive }) =>
                            `professor-nav-link ${
                                isActive
                                    ? "active"
                                    : ""
                            }`
                        }
                        onClick={closeSidebar}
                    >
                        <FaQrcode />
                        <span>QR Scanner</span>
                    </NavLink>

                    <NavLink
                        to="/professor/calendar"
                        className={({ isActive }) =>
                            `professor-nav-link ${
                                isActive
                                    ? "active"
                                    : ""
                            }`
                        }
                        onClick={closeSidebar}
                    >
                        <FaCalendarAlt />
                        <span>Calendar</span>
                    </NavLink>

                    <NavLink
                        to="/professor/requests"
                        className={({ isActive }) =>
                            `professor-nav-link ${
                                isActive
                                    ? "active"
                                    : ""
                            }`
                        }
                        onClick={closeSidebar}
                    >
                        <FaClipboardList />
                        <span>Pending Requests</span>

                        <span className="professor-nav-badge">
                            0
                        </span>
                    </NavLink>

                </nav>

                <div className="professor-sidebar-bottom">

                    <div className="professor-profile-mini">
                        <div className="professor-avatar">
                            P
                        </div>

                        <div className="professor-profile-info">
                            <strong>{profile?.full_name || "Professor"}</strong>
                            <span>CTHM Faculty</span>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="professor-logout"
                        onClick={handleLogout}
                    >
                        <FaSignOutAlt />
                        <span>Sign Out</span>
                    </button>

                </div>
            </aside>

            {/* MAIN AREA */}
            <div className="professor-main">

                {/* TOPBAR */}
                <header className="professor-topbar">

                    <button
                        type="button"
                        className="professor-mobile-menu"
                        onClick={() =>
                            setSidebarOpen(true)
                        }
                        aria-label="Open navigation"
                    >
                        <FaBars />
                    </button>

                    <div className="professor-topbar-title">
                        <span>CTHM STOCK ROOM</span>
                    </div>

                    <div className="professor-topbar-right">
                        <div className="professor-topbar-user">
                            <div className="professor-topbar-avatar">
                                P
                            </div>

                            <div>
                                <strong>
                                    {profile?.full_name || "Professor"}
                                </strong>

                                <span>
                                    Faculty
                                </span>
                            </div>
                        </div>
                    </div>

                </header>

                {/* PAGE CONTENT */}
                <main className="professor-content">
                    <Outlet />
                </main>

            </div>

        </div>
    );
}
