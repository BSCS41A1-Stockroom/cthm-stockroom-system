import { FiMenu } from "react-icons/fi";
import { useAuth } from "../../auth/useAuth";
import NotificationCenter from "../common/NotificationCenter";

export default function Topbar({
  setSidebarOpen,
  setSidebarCollapsed,
}) {
  const { profile, signOut } = useAuth();

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

        <NotificationCenter />

        <div
          className="admin-profile"
          onClick={signOut}
          title="Sign out"
        >
          <img
            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.full_name || "User")}&background=2563eb&color=fff`}
            alt="Account"
          />

          <div>
            <h4>{profile?.full_name || "Account"}</h4>
            <span>{profile?.role} · Sign out</span>
          </div>

        </div>

      </div>

    </header>
  );
}
