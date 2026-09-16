import { useEffect, useState } from "react";
import { FaArrowLeft, FaCalendarCheck, FaExclamationTriangle } from "react-icons/fa";
import { authenticatedFetch } from "../../../lib/api";

const formatDate = (value) => value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(value)) : "Not scheduled";

export default function InspectionPanel({ item, asset, onBack, onChanged, onMaintenance }) {
  const [data, setData] = useState({ settings: {}, inspections: [] });
  const [intervalDays, setIntervalDays] = useState("");
  const [form, setForm] = useState({ result: "good", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const response = await authenticatedFetch(`/api/inventory/${item.id}/assets/${asset.id}/inspections`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "Unable to load inspections.");
    setData(body); setIntervalDays(body.settings.intervalDays ?? "");
  }

  useEffect(() => {
    let active = true;
    authenticatedFetch(`/api/inventory/${item.id}/assets/${asset.id}/inspections`).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to load inspections.");
      if (active) { setData(body); setIntervalDays(body.settings.intervalDays ?? ""); }
    }).catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [asset.id, item.id]);

  async function saveSchedule(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/inventory/${item.id}/assets/${asset.id}/inspection-settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intervalDays: intervalDays === "" ? null : Number(intervalDays) }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.message || "Unable to save the schedule.");
      await load(); await onChanged?.();
    } catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }

  async function inspect(event) {
    event.preventDefault();
    if (form.result === "damaged" && !window.confirm("This result will remove the asset from availability and create a maintenance case. Continue?")) return;
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/inventory/${item.id}/assets/${asset.id}/inspections`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json(); if (!response.ok) throw new Error(body.message || "Unable to record the inspection.");
      setForm({ result: "good", notes: "" }); await load(); await onChanged?.(); if (body.maintenanceCreated) onMaintenance?.();
    } catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }

  const due = data.settings.nextInspectionDate && data.settings.nextInspectionDate.slice(0, 10) <= new Date().toISOString().slice(0, 10);
  return <section className="inspection-panel">
    <header className="maintenance-panel-header"><button className="maintenance-back" onClick={onBack}><FaArrowLeft /> Assets</button><div><span className="maintenance-eyebrow"><FaCalendarCheck /> Preventive Inspection</span><h3>{asset.assetNumber}</h3><p>{item.item_name} · Next inspection: {formatDate(data.settings.nextInspectionDate)}</p></div>{due && <span className="maintenance-status overdue"><FaExclamationTriangle /> Inspection Due</span>}</header>
    {error && <p className="availability-error maintenance-error">{error}</p>}
    <form className="inspection-schedule" onSubmit={saveSchedule}><div><strong>Recurring schedule</strong><p>Leave blank to disable scheduled inspections.</p></div><label>Interval (days)<input type="number" min="1" max="3650" value={intervalDays} onChange={(event) => setIntervalDays(event.target.value)} /></label><button className="save-btn" disabled={busy}>Save Schedule</button></form>
    <form className="maintenance-form" onSubmit={inspect}><div><strong>Record an inspection</strong><p>Submitting a damaged result automatically opens a maintenance case.</p></div><div className="maintenance-fields"><label>Result<select value={form.result} onChange={(event) => setForm((value) => ({ ...value, result: event.target.value }))}><option value="good">Good</option><option value="fair">Fair</option><option value="damaged">Damaged</option></select></label><label className="maintenance-notes">Inspection notes<textarea required minLength="5" maxLength="1000" value={form.notes} onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))} /></label></div><div className="maintenance-form-footer"><span>Inspections are permanently recorded in the audit history.</span><button className="save-btn" disabled={busy || asset.status !== "available"}>{busy ? "Saving..." : "Record Inspection"}</button></div>{asset.status !== "available" && <p className="reconciliation-note">This asset must be available before a preventive inspection can be recorded.</p>}</form>
    <div className="maintenance-history"><h4>Inspection History</h4>{data.inspections.length === 0 ? <p className="maintenance-empty">No inspections recorded yet.</p> : data.inspections.map((entry) => <article key={entry.id}><span className={`maintenance-timeline-dot ${entry.result === "damaged" ? "retired" : "completed"}`} /><div><div className="maintenance-history-title"><strong>{entry.result[0].toUpperCase()+entry.result.slice(1)}</strong><time>{formatDate(entry.inspected_at)}</time></div><p>{entry.notes}</p><footer><span>{entry.inspector_name || "Former staff account"}</span><span>Next: {formatDate(entry.next_inspection_date)}</span></footer></div></article>)}</div>
  </section>;
}
