import { useNavigate } from "react-router-dom";
import {
    FiMenu,
    FiSearch,
    FiBell,
} from "react-icons/fi";

export default function Topbar({
    sidebarOpen,
    setSidebarOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
}) {

    const navigate = useNavigate();

    const isMobile = window.innerWidth <= 768;

    const toggleSidebar = () => {

        if (isMobile) {

            setSidebarOpen(!sidebarOpen);

        } else {

            setSidebarCollapsed(!sidebarCollapsed);

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

                <div className="admin-search">

                    <FiSearch />

                    <input
                        type="text"
                        placeholder="Search..."
                    />

                </div>

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

                        <h4>
                            Administrator
                        </h4>

                        <span>
                            Click to switch
                        </span>

                    </div>

                </div>

            </div>

        </header>

    );

}