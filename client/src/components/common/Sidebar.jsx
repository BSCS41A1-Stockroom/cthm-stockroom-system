import { NavLink } from "react-router-dom";
import {
  FaHome,
  FaBoxOpen,
  FaCalendarAlt,
  FaClipboardList,
} from "react-icons/fa";

export default function Sidebar({
  sidebarOpen,
  setSidebarOpen,
  sidebarCollapsed,
}) {
  return (
    <>
      {sidebarOpen && (
        <div
          className="overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`sidebar ${
          sidebarOpen ? "show" : ""
        } ${sidebarCollapsed ? "collapsed" : ""}`}
      >
        <div className="sidebar-header">
          {!sidebarCollapsed && <h2>CTHM</h2>}
        </div>

        <nav>
          <NavLink to="/">
            <FaHome />
            {!sidebarCollapsed && <span>Home</span>}
          </NavLink>

          <NavLink to="/borrowing">
            <FaBoxOpen />
            {!sidebarCollapsed && <span>Borrowing</span>}
          </NavLink>

          <NavLink to="/calendar">
            <FaCalendarAlt />
            {!sidebarCollapsed && <span>Calendar</span>}
          </NavLink>

          <NavLink to="/my-requests">
            <FaClipboardList />
            {!sidebarCollapsed && <span>My Requests</span>}
          </NavLink>
        </nav>
      </aside>
    </>
  );
}
