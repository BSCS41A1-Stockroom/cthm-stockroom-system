import {
  FaArrowRight,
  FaClipboardList,
  FaBoxOpen
} from "react-icons/fa";

import { useNavigate } from "react-router-dom";

export default function Hero() {
  const navigate = useNavigate();

  return (
    <div className="home-hero">

      {/* =====================================================
          STATUS BAR
      ===================================================== */}

      <section className="status-bar">

        <div className="status-greeting">

          <strong>Welcome back!</strong>

          <span>
            CTHM Student · Manage your stockroom requests
          </span>

        </div>


        <div className="status-numbers">

          <div className="status-number">

            <strong>2</strong>

            <span>ACTIVE</span>

          </div>


          <div className="status-number due">

            <strong>1</strong>

            <span>DUE TOMORROW</span>

          </div>


          <div className="status-number">

            <strong>128</strong>

            <span>ITEMS IN STOCK</span>

          </div>

        </div>

      </section>


      {/* =====================================================
          PRIMARY ACTION
      ===================================================== */}

      <section className="primary-action">

        <div className="primary-action-text">

          <h2>
            Need equipment for class?
          </h2>

          <p>
            Submit a borrow request and get it approved
            before your scheduled activity.
          </p>

        </div>


        <div className="primary-action-buttons">

          <button
            className="btn-primary-light"
            onClick={() => navigate("/borrowing")}
          >

            <FaBoxOpen />

            New borrow request

            <FaArrowRight />

          </button>


          <button
            className="btn-primary-ghost"
            onClick={() => navigate("/requests")}
          >

            <FaClipboardList />

            View my requests

          </button>

        </div>

      </section>

    </div>
  );
}