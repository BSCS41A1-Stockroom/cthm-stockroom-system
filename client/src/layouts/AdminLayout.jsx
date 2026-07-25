import { useState } from "react";
import { Outlet } from "react-router-dom";

import Sidebar from "../components/admin/Sidebar";
import Topbar from "../components/admin/Topbar";

import "../styles/admin.css";

export default function AdminLayout() {

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    return (

        <div className="admin-layout">

            <Sidebar
                sidebarOpen={sidebarOpen}
                setSidebarOpen={setSidebarOpen}
                sidebarCollapsed={sidebarCollapsed}
            />

            <div
                className={`admin-main ${
                    sidebarCollapsed ? "expanded" : ""
                }`}
            >

                <Topbar
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                    sidebarCollapsed={sidebarCollapsed}
                    setSidebarCollapsed={setSidebarCollapsed}
                />

                <div className="admin-page">

                    <Outlet />

                </div>

            </div>

        </div>

    );

}