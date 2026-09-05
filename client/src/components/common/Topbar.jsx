import { useEffect, useState } from "react";
import NotificationCenter from "./NotificationCenter";
import ProfileMenu from "./ProfileMenu";

export default function Topbar({ sidebarOpen, setSidebarOpen, sidebarCollapsed, setSidebarCollapsed }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isActive = isMobile ? sidebarOpen : !sidebarCollapsed;
  const toggleSidebar = () => {
    if (isMobile) setSidebarOpen(!sidebarOpen);
    else setSidebarCollapsed(!sidebarCollapsed);
  };

  return <header className="topbar">
    <button className={`menu-btn ${isActive ? "active" : ""} ${isMobile ? "mobile" : "desktop"}`} onClick={toggleSidebar}>
      <span/><span/><span/>
    </button>
    <h2>CTHM Stockroom</h2>
    <div className="student-topbar-actions">
      <NotificationCenter />
      <ProfileMenu variant="student" />
    </div>
  </header>;
}
