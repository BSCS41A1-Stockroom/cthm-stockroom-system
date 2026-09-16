import { useEffect, useState } from "react";
import { authenticatedFetch } from "../../../lib/api";

export default function ReconciliationModal({ onClose, onChanged }) {
  const [data, setData] = useState({ session: null, items: [], assets: [] });
  const [notes, setNotes] = useState("");
  const [token, setToken] = useState("");
  const [condition, setCondition] = useState("good");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await authenticatedFetch("/api/reconciliations/active"); const body = await response.json();
    if (!response.ok) throw new Error(body.message || "Unable to load the physical count."); setData(body);
  }
  useEffect(() => { let active = true; authenticatedFetch("/api/reconciliations/active").then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.message || "Unable to load the physical count."); if (active) setData(body); }).catch((error) => { if (active) setMessage(error.message); }); return () => { active = false; }; }, []);

  async function request(path, options) {
    setBusy(true); setMessage("");
    try { const response = await authenticatedFetch(path, options); const body = await response.json(); if (!response.ok) throw new Error(body.message || "Unable to update the physical count."); return body; }
    catch (error) { setMessage(error.message); return null; } finally { setBusy(false); }
  }
  async function start() { const body = await request("/api/reconciliations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }) }); if (body) setData(body); }
  async function saveCount(item, count) { const body = await request(`/api/reconciliations/${data.session.id}/counts/${item.inventory_id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count: Number(count) }) }); if (body) setData((current) => ({ ...current, items: current.items.map((entry) => entry.id === item.id ? { ...entry, ...body.item } : entry) })); }
  async function scan(event) { event.preventDefault(); const body = await request(`/api/reconciliations/${data.session.id}/assets/scan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.trim(), condition }) }); if (body) { setToken(""); setMessage(`${body.asset.asset_number} counted.`); await load(); } }
  async function finish(applyAdjustments) { const discrepancies = data.items.some((item) => item.discrepancy && Number(item.discrepancy) !== 0) || data.assets.some((asset) => asset.discrepancy_type || (!asset.scanned_at && ["available", "maintenance"].includes(asset.expected_status))); const reason = discrepancies ? window.prompt("Explain the discrepancies and adjustment decision:")?.trim() : ""; if (discrepancies && !reason) return; if (!window.confirm(`${applyAdjustments ? "Apply adjustments and complete" : "Complete without adjusting"} this physical count?`)) return; const body = await request(`/api/reconciliations/${data.session.id}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applyAdjustments, reason }) }); if (body) { onChanged?.(); onClose(); } }
  async function cancel() { if (!window.confirm("Cancel this physical count? Recorded counts will remain in history but no inventory will change.")) return; const body = await request(`/api/reconciliations/${data.session.id}`, { method: "DELETE" }); if (body) onClose(); }

  const bulk = data.items.filter((item) => item.tracking_type === "bulk");
  const serialized = data.items.filter((item) => item.tracking_type === "serialized");
  return <div className="modal-overlay"><div className="modal reconciliation-modal"><div className="modal-header"><div><h2>Physical Inventory Count</h2><p>Borrowed assets are excluded from expected on-hand stock.</p></div><button onClick={onClose}>×</button></div><div className="modal-body reconciliation-body">
    {!data.session ? <section className="reconciliation-start"><label>Stocktake notes<textarea maxLength="1000" rows="3" value={notes} onChange={(event) => setNotes(event.target.value)} /></label><button className="save-btn" onClick={start} disabled={busy}>Start Physical Count</button></section> : <>
      <div className="reconciliation-summary"><strong>Started {new Date(data.session.started_at).toLocaleString()}</strong><span>{data.session.notes || "No starting notes"}</span></div>
      <section><h3>Bulk quantities</h3><div className="reconciliation-list">{bulk.map((item) => <div key={item.id}><span><strong>{item.item_name}</strong><small>Expected on hand: {item.expected_on_hand}</small></span><label>Actual count<input type="number" min="0" defaultValue={item.counted_on_hand ?? ""} onBlur={(event) => event.target.value !== "" && saveCount(item, event.target.value)} /></label><b className={Number(item.discrepancy) ? "count-warning" : ""}>{item.counted_on_hand == null ? "Not counted" : `Difference: ${item.discrepancy > 0 ? "+" : ""}${item.discrepancy}`}</b></div>)}</div></section>
      <section><h3>Serialized assets</h3><form className="reconciliation-scan" onSubmit={scan}><input autoFocus value={token} onChange={(event) => setToken(event.target.value)} placeholder="Scan asset QR" /><select value={condition} onChange={(event) => setCondition(event.target.value)}><option value="good">Good</option><option value="fair">Fair</option><option value="damaged">Damaged</option><option value="under_inspection">Under inspection</option></select><button disabled={busy || !token.trim()}>Count Asset</button></form><div className="reconciliation-list">{serialized.map((item) => { const assets = data.assets.filter((asset) => String(asset.inventory_id) === String(item.inventory_id)); const scanned = assets.filter((asset) => asset.scanned_at).length; return <div key={item.id}><span><strong>{item.item_name}</strong><small>Expected: {item.expected_on_hand}</small></span><b>{scanned} scanned</b><span className={assets.some((asset) => asset.discrepancy_type) ? "count-warning" : ""}>{assets.filter((asset) => asset.discrepancy_type).length} flagged</span></div>; })}</div></section>
      <p className="reconciliation-note">Completing the count marks unscanned on-hand serialized assets as discrepancies. Inventory changes only when “Apply Adjustments” is selected.</p>
    </>}
    {message && <p className="availability-error">{message}</p>}
  </div><div className="modal-footer">{data.session && <><button className="delete-btn" onClick={cancel} disabled={busy}>Cancel Count</button><button className="cancel-btn" onClick={() => finish(false)} disabled={busy}>Complete Without Adjusting</button><button className="save-btn" onClick={() => finish(true)} disabled={busy}>Apply Adjustments & Complete</button></>}<button className="cancel-btn" onClick={onClose}>Close</button></div></div></div>;
}
