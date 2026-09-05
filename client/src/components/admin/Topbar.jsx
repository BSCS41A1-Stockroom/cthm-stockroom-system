import { FiMenu } from "react-icons/fi";
import NotificationCenter from "../common/NotificationCenter";
import ProfileMenu from "../common/ProfileMenu";

export default function Topbar({ setSidebarOpen, setSidebarCollapsed }) {
  const toggleSidebar = () => {
    if (window.innerWidth <= 1000) setSidebarOpen((previous) => !previous);
    else setSidebarCollapsed((previous) => !previous);
  };

  return (
    <header className="admin-topbar">
      <div className="admin-topbar-left">
        <button className="admin-menu-btn" onClick={toggleSidebar}><FiMenu /></button>
        <h2>CTHM Stockroom</h2>
      </div>
      <div className="admin-topbar-right">
        <NotificationCenter />
        <ProfileMenu variant="admin" />
      </div>
    </header>
  );
}
