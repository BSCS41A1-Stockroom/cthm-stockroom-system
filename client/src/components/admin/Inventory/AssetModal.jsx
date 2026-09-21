import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { authenticatedFetch } from "../../../lib/api";
import { useFeedback } from "../../common/feedbackContext";
import MaintenancePanel from "./MaintenancePanel";
import InspectionPanel from "./InspectionPanel";

function inspectionLabel(asset) {
  if (!asset.inspectionIntervalDays) return null;
  const next = String(asset.nextInspectionDate || "").slice(0, 10);
  if (!next) return "Inspection schedule pending";
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return `${next <= localToday ? "Inspection due" : "Next inspection"}: ${next}`;
}

function inspectionIsDue(asset) {
  const next = String(asset.nextInspectionDate || "").slice(0, 10);
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return Boolean(next && next <= localToday);
}

export default function AssetModal({ item, onClose, onChanged }) {
  const { confirm, prompt } = useFeedback();
  const [assets, setAssets] = useState([]);
  const [serialNumber, setSerialNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qr, setQr] = useState(null);
  const [maintenanceAsset, setMaintenanceAsset] = useState(null);
  const [inspectionAsset, setInspectionAsset] = useState(null);

  async function load() {
    const response = await authenticatedFetch(`/api/inventory/${item.id}/assets`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "Unable to load serialized assets.");
    setAssets(body.assets);
  }

  useEffect(() => {
    let active = true;
    authenticatedFetch(`/api/inventory/${item.id}/assets`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "Unable to load serialized assets.");
        if (active) setAssets(body.assets);
      })
      .catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [item.id]);

  async function add(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/inventory/${item.id}/assets`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serialNumber }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to add asset.");
      setSerialNumber(""); await load(); onChanged?.();
    } catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }

  async function showQr(asset) {
    setQr({ asset, image: await QRCode.toDataURL(asset.qrToken, { width: 320, margin: 2, errorCorrectionLevel: "M" }) });
  }

  async function change(asset, status, condition) {
    const note = status === "maintenance" ? await prompt("Maintenance or inspection note:", { initialValue: asset.maintenanceNote || "" }) : asset.maintenanceNote || "";
    if (status === "maintenance" && !note) return;
    if (status === "retired" && !await confirm(`Retire ${asset.assetNumber}? This cannot be undone.`, { danger: true })) return;
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/inventory/${item.id}/assets/${asset.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serialNumber: asset.serialNumber || "", status, condition, maintenanceNote: note, inspected: status !== "retired" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to update asset.");
      await load(); onChanged?.();
    } catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }

  async function resolveIncident(asset, resolution) {
    const note = await prompt(`Resolution details for ${asset.assetNumber}:`);
    if (!note) return;
    if (note.length < 5 || note.length > 500) { setError("Resolution details must contain 5 to 500 characters."); return; }
    if (!await confirm(`${resolution === "recovered" ? "Return" : "Write off"} ${asset.assetNumber}? This incident resolution is audited.`, { danger: resolution === "written_off" })) return;
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/inventory/${item.id}/assets/${asset.id}/incidents/${asset.incident.id}/resolve`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolution, note }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to resolve the incident.");
      await load(); onChanged?.();
    } catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }

  return <div className="modal-overlay"><div className="modal asset-modal">
    <div className="modal-header"><div><h2>Serialized Assets</h2><p>{item.item_name}</p></div><button onClick={onClose} aria-label="Close">×</button></div>
    <div className="modal-body asset-modal-body">
      {maintenanceAsset ? <MaintenancePanel item={item} asset={maintenanceAsset} onBack={() => setMaintenanceAsset(null)} onChanged={async () => { await load(); onChanged?.(); }} /> : inspectionAsset ? <InspectionPanel item={item} asset={inspectionAsset} onBack={() => setInspectionAsset(null)} onChanged={async () => { await load(); onChanged?.(); }} onMaintenance={() => { setInspectionAsset(null); load(); }} /> : <>
      <form className="asset-add-form" onSubmit={add}><label>Manufacturer serial number (optional)<input maxLength="120" value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} /></label><button className="save-btn" disabled={busy}>Add Physical Asset</button></form>
      {error && <p className="availability-error">{error}</p>}
      <div className="asset-list">{assets.length === 0 ? <p>No physical assets registered yet.</p> : assets.map((asset) => <article key={asset.id} className="asset-row">
        <div><strong>{asset.assetNumber}</strong><span>Serial: {asset.serialNumber || "Not provided"}</span><span>{asset.status} · {asset.condition}</span>{inspectionLabel(asset) && <span className={inspectionIsDue(asset) ? "asset-inspection-due" : "asset-inspection-date"}>{inspectionLabel(asset)}</span>}{asset.incident && <span className="asset-incident-reason">Incident: {asset.incident.reason}</span>}</div>
        <div className="asset-actions"><button onClick={() => showQr(asset)}>View / Print QR</button>
          {asset.status !== "retired" && asset.status !== "missing" && <button onClick={() => setInspectionAsset(asset)}>Inspections</button>}
          {asset.status !== "borrowed" && asset.status !== "retired" && asset.status !== "missing" && (asset.status === "maintenance"
            ? <button className="maintenance-manage" onClick={() => setMaintenanceAsset(asset)}>Manage Maintenance</button>
            : <button onClick={() => change(asset, "maintenance", "under_inspection")}>Send to Inspection</button>)}
          {asset.status === "available" && <button className="danger-text" onClick={() => change(asset, "retired", "retired")}>Retire</button>}
          {asset.status === "missing" && asset.incident && <><button onClick={() => resolveIncident(asset, "recovered")}>Mark Recovered</button><button className="danger-text" onClick={() => resolveIncident(asset, "written_off")}>Write Off</button></>}
        </div>
      </article>)}</div>
      {qr && <div className="asset-qr-card"><h3>{qr.asset.assetNumber}</h3><img src={qr.image} alt={`QR code for ${qr.asset.assetNumber}`} /><p>{item.item_name}</p><button onClick={() => window.print()}>Print QR Label</button><button onClick={() => setQr(null)}>Close QR</button></div>}
      </>}
    </div>
    <div className="modal-footer"><button className="cancel-btn" onClick={onClose}>Done</button></div>
  </div></div>;
}
