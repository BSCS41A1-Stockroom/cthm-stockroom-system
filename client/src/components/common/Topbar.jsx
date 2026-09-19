import { useEffect, useState } from "react";
import { FaBars } from "react-icons/fa";

import NotificationCenter from "./NotificationCenter";
import ProfileMenu from "./ProfileMenu";

export default function Topbar({
    sidebarOpen,
    setSidebarOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
    variant = "student",
}) {
    const [isMobile, setIsMobile] = useState(
        window.innerWidth <= 900
    );

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth <= 900);
        };

        window.addEventListener(
            "resize",
            handleResize
        );

        return () => {
            window.removeEventListener(
                "resize",
                handleResize
            );
        };
    }, []);

    const isProfessor = variant === "professor";

    const toggleSidebar = () => {
        if (isMobile) {
            setSidebarOpen(!sidebarOpen);
        } else {
            setSidebarCollapsed(
                !sidebarCollapsed
            );
        }
    };

    return (
        <header className="topbar">
            <div className="topbar-left">

                <button
                    type="button"
                    className={`topbar-menu ${
                        sidebarOpen ||
                        !sidebarCollapsed
                            ? "active"
                            : ""
                    }`}
                    onClick={toggleSidebar}
                    aria-label="Toggle navigation"
                >
                    <FaBars />
                </button>

                <div className="topbar-title">
                    <span className="topbar-title-main">
                        CTHM STOCK ROOM
                    </span>

                    <span className="topbar-title-sub">
                        {isProfessor
                            ? "Professor Portal"
                            : "Student Portal"}
                    </span>
                </div>

            </div>

            <div className="topbar-right">

                <NotificationCenter />

                <div className="topbar-divider" />

                <ProfileMenu
                    variant={
                        isProfessor
                            ? "professor"
                            : "student"
                    }
                />

            </div>
        </header>
    );
}