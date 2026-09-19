import { useState } from "react";
import { Outlet } from "react-router-dom";

import Sidebar from "../components/common/Sidebar";
import Topbar from "../components/common/Topbar";

export default function StudentLayout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    return (
        <div
            className={`layout ${
                sidebarCollapsed
                    ? "sidebar-is-collapsed"
                    : ""
            }`}
        >
            <Sidebar
                sidebarOpen={sidebarOpen}
                setSidebarOpen={setSidebarOpen}
                sidebarCollapsed={sidebarCollapsed}
                variant="student"
            />

            <div
                className={`main-content ${
                    sidebarCollapsed
                        ? "expanded"
                        : ""
                }`}
            >
                <Topbar
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                    sidebarCollapsed={sidebarCollapsed}
                    setSidebarCollapsed={
                        setSidebarCollapsed
                    }
                    variant="student"
                />

                <main className="page-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}