import { useState } from "react";
import { Outlet } from "react-router-dom";

import Sidebar from "../components/common/Sidebar";
import Topbar from "../components/common/Topbar";

import "../styles/professor.css";
import "../styles/common.css";

export default function ProfessorLayout() {
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
                variant="professor"
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
                    variant="professor"
                />

                <main className="page-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}