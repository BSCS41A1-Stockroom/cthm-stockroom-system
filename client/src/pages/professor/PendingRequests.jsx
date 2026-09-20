import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FaCheck, FaClipboardList, FaEye, FaSearch } from "react-icons/fa";
import { authenticatedFetch } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import "../../styles/professor.css";
import { isInRoleQueue, stageLabel } from "../../utils/requestWorkflow";

const formatDate = (value) => new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });

export default function PendingRequests() {
  const [requests, setRequests] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("queue");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await authenticatedFetch("/api/borrowings");
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setRequests(body.requests || []);
    } catch (loadError) { setError(loadError.message || "Unable to load requests."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    const channel = supabase.channel("professor-authorizations")
      .on("postgres_changes", { event: "*", schema: "public", table: "borrow_requests" }, load)
      .subscribe();
    return () => { window.clearTimeout(timer); supabase.removeChannel(channel); };
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visible = view === "queue"
      ? requests.filter((request) => isInRoleQueue(request, "professor"))
      : requests.filter((request) => !isInRoleQueue(request, "professor"));
    return visible.filter((request) => !query || [request.studentName, request.studentId, request.purpose, ...(request.items || []).map((item) => item.name)].join(" ").toLowerCase().includes(query));
  }, [requests, search, view]);

  const queueCount = requests.filter((request) => isInRoleQueue(request, "professor")).length;

  return <div className="professor-requests-page">
    <div className="professor-page-header"><div><div className="professor-page-eyebrow">PROFESSOR PORTAL</div><h1>Pending Requests</h1><p>Review and electronically authorize validated student borrowing requests.</p></div></div>
    <div className="professor-request-summary"><div className="professor-request-summary-card"><div className="professor-summary-icon"><FaClipboardList /></div><div><span>Pending Review</span><strong>{queueCount}</strong></div></div><div className="professor-request-summary-text">A QR or review button opens the same protected authorization document.</div></div>
    <div className="professor-request-tabs" role="tablist" aria-label="Request views"><button type="button" role="tab" aria-selected={view === "queue"} className={view === "queue" ? "active" : ""} onClick={() => setView("queue")}>My Work Queue <span>{queueCount}</span></button><button type="button" role="tab" aria-selected={view === "history"} className={view === "history" ? "active" : ""} onClick={() => setView("history")}>History <span>{requests.length - queueCount}</span></button></div>
    <div className="professor-request-search"><FaSearch /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, ID, purpose, or item..." /></div>
    {error && <p className="form-error">{error}</p>}
    <div className="professor-request-list">
      {loading && <div className="professor-empty-state">Loading requests...</div>}
      {!loading && !filtered.length && <div className="professor-empty-state">{view === "queue" ? "No requests are waiting for professor authorization." : "No request history found."}</div>}
      {filtered.map((request) => <article className="professor-request-card" key={request.id}>
        <div className="professor-request-main"><div className="professor-request-student"><div className="professor-student-avatar">{request.studentName?.charAt(0)}</div><div><h3>{request.studentName}</h3><span>{request.studentId} · {request.sectionName || "Section not assigned"}</span></div></div><span className={`professor-workflow-status ${String(request.status).toLowerCase()}`}>{stageLabel(request)}</span><p>{request.purpose}</p><div className="professor-request-meta"><span>{request.departmentName || "Department not assigned"}</span><span>{formatDate(request.borrowDate)} – {formatDate(request.returnDate)}</span><span>{(request.items || []).reduce((sum, item) => sum + Number(item.quantity), 0)} unit(s)</span></div></div>
        <div className="professor-request-actions"><button type="button" onClick={() => setSelected(request)}><FaEye /> View</button>{isInRoleQueue(request, "professor") && <Link to={`/authorize/${request.authorizationToken}`}><FaCheck /> Review & Sign</Link>}</div>
      </article>)}
    </div>
    {selected && <div className="modal-overlay" onClick={() => setSelected(null)}><div className="modal-card" onClick={(event) => event.stopPropagation()}><div className="modal-header"><h2>BR-{String(selected.id).padStart(3, "0")}</h2><button onClick={() => setSelected(null)}>×</button></div><p><strong>{selected.studentName}</strong> · {selected.studentId}</p><p>{selected.departmentName || "Department not assigned"} · {selected.sectionName || "Section not assigned"}</p><ul>{selected.items.map((item) => <li key={item.inventoryId}>{item.name} × {item.quantity}</li>)}</ul><p>{selected.purpose}</p><div className="request-detail-actions"><Link className="approve-btn" to={`/authorize/${selected.authorizationToken}`}>Open authorization document</Link></div></div></div>}
  </div>;
}
