import { FaArrowRight, FaBoxes } from "react-icons/fa";
import { useNavigate } from "react-router-dom";

export default function Hero() {
  const navigate = useNavigate();

  return (
    <section className="hero">
      <div className="hero-content">
        <span className="hero-label">
          CTHM STOCKROOM
        </span>

        <h1>
          Laboratory Equipment
          <br />
          Management System
        </h1>

        <p>
          Manage laboratory equipment, borrowing requests,
          schedules, and stockroom activities in one
          centralized platform.
        </p>

        <button
          className="hero-button"
          onClick={() => navigate("/borrowing")}
        >
          Browse Equipment
          <FaArrowRight />
        </button>
      </div>

      <div className="hero-visual">
        <div className="hero-visual-header">
          <span>STOCKROOM OVERVIEW</span>

          <span className="status-indicator">
            <span></span>
            SYSTEM ACTIVE
          </span>
        </div>

        <div className="hero-box">
          <FaBoxes />
        </div>

        <div className="hero-stats">
          <div>
            <strong>128</strong>
            <span>Equipment Items</span>
          </div>

          <div>
            <strong>24</strong>
            <span>Available Today</span>
          </div>

          <div>
            <strong>08</strong>
            <span>Pending Requests</span>
          </div>
        </div>
      </div>
    </section>
  );
}