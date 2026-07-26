import { FaBars } from "react-icons/fa";

export default function Topbar({
  sidebarOpen,
  setSidebarOpen,
  sidebarCollapsed,
  setSidebarCollapsed,
}) {
  const navigate = useNavigate();

  const isMobile = window.innerWidth <= 768;

  const isActive = isMobile ? sidebarOpen : sidebarCollapsed;

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

      <div className="user">Student</div>
    </header>
  );
}