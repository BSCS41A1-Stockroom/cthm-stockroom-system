import { useEffect, useState } from "react";
import { FaArrowLeft, FaCheckCircle, FaClock, FaExclamationTriangle, FaTools } from "react-icons/fa";
import { authenticatedFetch } from "../../../lib/api";

const labels = { under_inspection: "Under Inspection", under_repair: "Under Repair", completed: "Returned to Service", retired: "Retired" };
const isOpen = (status) => ["under_inspection", "under_repair"].includes(status);
const formatDate = (value) => value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(value)) : "Not set";

export default function MaintenancePanel({ item, asset, onBack, onChanged }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ status: "under_inspection", dueDate: "", cost: "0", repairNotes: "" });
  const active = records.find((record) => isOpen(record.status));
  const closing = ["completed", "retired"].includes(form.status);

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/inventory/${item.id}/assets/${asset.id}/maintenance`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to load maintenance history.");
      setRecords(body.maintenance);
      const current = body.maintenance.find((record) => isOpen(record.status));
      if (current) setForm({ status: current.status, dueDate: current.dueDate?.slice(0, 10) || "", cost: String(current.cost ?? 0), repairNotes: current.repairNotes || "" });
    } catch (reason) { setError(reason.message); } finally { setLoading(false); }
  }

  useEffect(() => {
    let mounted = true;
    authenticatedFetch(`/api/inventory/${item.id}/assets/${asset.id}/maintenance`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "Unable to load maintenance history.");
        if (!mounted) return;
        setRecords(body.maintenance);
        const current = body.maintenance.find((record) => isOpen(record.status));
        if (current) setForm({ status: current.status, dueDate: current.dueDate?.slice(0, 10) || "", cost: String(current.cost ?? 0), repairNotes: current.repairNotes || "" });
      })
      .catch((reason) => { if (mounted) setError(reason.message); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [asset.id, item.id]);

  async function save(event) {
    event.preventDefault();
    if (!active) return;
    if (closing && !window.confirm(form.status === "retired" ? `Retire ${asset.assetNumber} permanently?` : `Confirm that ${asset.assetNumber} is safe to return to service?`)) return;
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/inventory/${item.id}/assets/${asset.id}/maintenance/${active.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || body.reasons?.[0] || "Unable to update maintenance.");
      await load(); await onChanged?.();
      if (closing) onBack();
    } catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }

  return <section className="maintenance-panel">
    <header className="maintenance-panel-header">
      <button type="button" className="maintenance-back" onClick={onBack}><FaArrowLeft /> Assets</button>
      <div><span className="maintenance-eyebrow"><FaTools /> Maintenance Case</span><h3>{asset.assetNumber}</h3><p>{item.item_name} · {asset.serialNumber || "No manufacturer serial"}</p></div>
      {active && <span className={`maintenance-status ${active.overdue ? "overdue" : active.status}`}>{active.overdue ? <FaExclamationTriangle /> : <FaClock />}{active.overdue ? "Overdue" : labels[active.status]}</span>}
    </header>
    {error && <p className="availability-error maintenance-error">{error}</p>}
    {loading ? <p className="maintenance-empty">Loading maintenance history...</p> : <>
      {active ? <form className="maintenance-form" onSubmit={save}>
        <div className="maintenance-problem"><strong>Reported problem</strong><p>{active.problemDescription}</p><small>Opened {formatDate(active.openedAt)} · Source: {active.source.replaceAll("_", " ")}</small></div>
        <div className="maintenance-fields">
          <label>Current stage<select value={form.status} onChange={(event) => setForm((value) => ({ ...value, status: event.target.value }))}><option value="under_inspection">Under Inspection</option><option value="under_repair">Under Repair</option><option value="completed">Repaired and Available</option><option value="retired">Retire Asset</option></select></label>
          <label>Target completion date<input type="date" value={form.dueDate} onChange={(event) => setForm((value) => ({ ...value, dueDate: event.target.value }))} /></label>
          <label>Repair cost (PHP)<input type="number" min="0" max="9999999999.99" step="0.01" value={form.cost} onChange={(event) => setForm((value) => ({ ...value, cost: event.target.value }))} /></label>
          <label className="maintenance-notes">Inspection / repair notes<textarea maxLength="2000" required={closing} value={form.repairNotes} onChange={(event) => setForm((value) => ({ ...value, repairNotes: event.target.value }))} placeholder="Record findings, repair work, replacement parts, or final disposition." /></label>
        </div>
        <div className="maintenance-form-footer"><span>{active.assignedName ? `Assigned to ${active.assignedName}` : "Saving assigns this case to you."}</span><button className={form.status === "retired" ? "maintenance-retire" : "save-btn"} disabled={busy}>{busy ? "Saving..." : closing ? "Close Maintenance Case" : "Save Progress"}</button></div>
      </form> : <div className="maintenance-closed"><FaCheckCircle /><div><strong>No active maintenance case</strong><p>This asset has no unresolved inspection or repair work.</p></div></div>}
      <div className="maintenance-history"><h4>Maintenance History</h4>{records.length === 0 ? <p className="maintenance-empty">No maintenance records yet.</p> : records.map((record) => <article key={record.id}><span className={`maintenance-timeline-dot ${record.status}`} /><div><div className="maintenance-history-title"><strong>{labels[record.status]}</strong><time>{formatDate(record.openedAt)}</time></div><p>{record.problemDescription}</p>{record.repairNotes && <small>{record.repairNotes}</small>}<footer><span>Cost: ₱{record.cost.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span><span>{record.assignedName || "Unassigned"}</span>{record.completedAt && <span>Closed {formatDate(record.completedAt)}</span>}</footer></div></article>)}</div>
    </>}
  </section>;
}
