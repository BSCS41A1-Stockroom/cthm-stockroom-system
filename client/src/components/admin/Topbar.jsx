import { useNavigate } from "react-router-dom";
import { FiMenu, FiBell } from "react-icons/fi";

export default function Topbar({
  setSidebarOpen,
  setSidebarCollapsed,
}) {
  const navigate = useNavigate();

const toggleSidebar = () => {
    if (window.innerWidth <= 1000) {
        setSidebarOpen((prev) => !prev);
    } else {
        setSidebarCollapsed((prev) => !prev);
    }
    };

  return (
    <header className="admin-topbar">

      <div className="admin-topbar-left">

        <button
        className="admin-menu-btn"
        onClick={toggleSidebar}
        >
        <FiMenu />
        </button>

        <h2>CTHM Stockroom</h2>

      </div>

      <div className="admin-topbar-right">

        <button className="admin-icon-btn">
          <FiBell />
          <span className="notification-dot"></span>
        </button>

        <div
          className="admin-profile"
          onClick={() => navigate("/")}
          title="Switch to Student"
        >
          <img
            src="https://ui-avatars.com/api/?name=Administrator&background=2563eb&color=fff"
            alt="Admin"
          />

          <div>
            <h4>Administrator</h4>
            <span>Switch to Student</span>
          </div>

        </div>

      </div>

    </header>
  );
}
