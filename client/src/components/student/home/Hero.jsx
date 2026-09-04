import { useEffect, useState } from "react";
import { FaArrowRight, FaClipboardList, FaBoxOpen } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { authenticatedFetch } from "../../../lib/api";
import { supabase } from "../../../lib/supabase";
import { inventoryTotals } from "../../../utils/inventoryAvailability";

function manilaDate(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export default function Hero() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ active: 0, dueTomorrow: 0, available: 0 });
  const [dataStatus, setDataStatus] = useState("LOADING DATA");

  useEffect(() => {
    let active = true;
    async function loadStats() {
      try {
        const [inventoryResult, requestResponse] = await Promise.all([
          supabase.from("inventory").select("*"),
          authenticatedFetch("/api/borrowings"),
        ]);
        const requestResult = await requestResponse.json();
        if (!active) return;
        if (inventoryResult.error || !requestResponse.ok) {
          setDataStatus("DATA UNAVAILABLE");
          return;
        }
        const inventory = inventoryResult.data || [];
        const requests = requestResult.requests || [];
        const tomorrow = manilaDate(1);
        setStats({
          active: requests.filter((request) => ["Pending", "Approved", "Borrowed"].includes(request.status)).length,
          dueTomorrow: requests.filter((request) => request.status === "Borrowed" && request.returnDate === tomorrow).length,
          available: inventory.reduce((sum, item) => sum + inventoryTotals(item).available, 0),
        });
        setDataStatus("LIVE DATA");
      } catch {
        if (active) setDataStatus("DATA UNAVAILABLE");
      }
    }
    loadStats();
    return () => { active = false; };
  }, []);

  return (
    <div className="home-hero">
      <section className="status-bar">
        <div className="status-greeting">
          <strong>Welcome back!</strong>
          <span>CTHM Student · Manage your stockroom requests · {dataStatus}</span>
        </div>
        <div className="status-numbers">
          <div className="status-number"><strong>{stats.active}</strong><span>ACTIVE</span></div>
          <div className="status-number due"><strong>{stats.dueTomorrow}</strong><span>DUE TOMORROW</span></div>
          <div className="status-number"><strong>{stats.available}</strong><span>AVAILABLE UNITS</span></div>
        </div>
      </section>
      <section className="primary-action">
        <div className="primary-action-text">
          <h2>Need equipment for class?</h2>
          <p>Submit a borrow request and get it approved before your scheduled activity.</p>
        </div>
        <div className="primary-action-buttons">
          <button className="btn-primary-light" onClick={() => navigate("/borrowing")}>
            <FaBoxOpen /> New borrow request <FaArrowRight />
          </button>
          <button className="btn-primary-ghost" onClick={() => navigate("/requests")}>
            <FaClipboardList /> View my requests
          </button>
        </div>
      </section>
    </div>
  );
}
