import { useEffect, useState } from "react";
import { useAuth } from "../../auth/useAuth";

export default function Topbar({
  sidebarOpen,
  setSidebarOpen,
  sidebarCollapsed,
  setSidebarCollapsed,
}) {
  const { profile, signOut } = useAuth();

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isActive = isMobile ? sidebarOpen : !sidebarCollapsed;

  const toggleSidebar = () => {
    if (isMobile) {
      setSidebarOpen(!sidebarOpen);
    } else {
      setSidebarCollapsed(!sidebarCollapsed);
    }
  };

  return (
    <header className="topbar">
      <button
        className={`menu-btn ${isActive ? "active" : ""} ${
          isMobile ? "mobile" : "desktop"
        }`}
        onClick={toggleSidebar}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      <h2>CTHM Stockroom</h2>

      <button
        className="role-switch"
        onClick={signOut}
      >
        {profile?.full_name || "Student"} · Sign out
      </button>
    </header>
  );
}
