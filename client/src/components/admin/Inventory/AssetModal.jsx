import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { authenticatedFetch } from "../../../lib/api";

export default function AssetModal({ item, onClose, onChanged }) {
  const [assets, setAssets] = useState([]);
  const [serialNumber, setSerialNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qr, setQr] = useState(null);

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
    const note = status === "maintenance" ? window.prompt("Maintenance or inspection note:", asset.maintenanceNote || "") : asset.maintenanceNote || "";
    if (status === "maintenance" && !note) return;
    if (status === "retired" && !window.confirm(`Retire ${asset.assetNumber}? This cannot be undone.`)) return;
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

  return <div className="modal-overlay"><div className="modal asset-modal">
    <div className="modal-header"><div><h2>Serialized Assets</h2><p>{item.item_name}</p></div><button onClick={onClose} aria-label="Close">×</button></div>
    <div className="modal-body asset-modal-body">
      <form className="asset-add-form" onSubmit={add}><label>Manufacturer serial number (optional)<input maxLength="120" value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} /></label><button className="save-btn" disabled={busy}>Add Physical Asset</button></form>
      {error && <p className="availability-error">{error}</p>}
      <div className="asset-list">{assets.length === 0 ? <p>No physical assets registered yet.</p> : assets.map((asset) => <article key={asset.id} className="asset-row">
        <div><strong>{asset.assetNumber}</strong><span>Serial: {asset.serialNumber || "Not provided"}</span><span>{asset.status} · {asset.condition}</span></div>
        <div className="asset-actions"><button onClick={() => showQr(asset)}>View / Print QR</button>
          {asset.status !== "borrowed" && asset.status !== "retired" && (asset.status === "maintenance"
            ? <button onClick={() => change(asset, "available", "good")}>Return to Service</button>
            : <button onClick={() => change(asset, "maintenance", "under_inspection")}>Send to Inspection</button>)}
          {asset.status !== "borrowed" && asset.status !== "retired" && <button className="danger-text" onClick={() => change(asset, "retired", "retired")}>Retire</button>}
        </div>
      </article>)}</div>
      {qr && <div className="asset-qr-card"><h3>{qr.asset.assetNumber}</h3><img src={qr.image} alt={`QR code for ${qr.asset.assetNumber}`} /><p>{item.item_name}</p><button onClick={() => window.print()}>Print QR Label</button><button onClick={() => setQr(null)}>Close QR</button></div>}
    </div>
    <div className="modal-footer"><button className="cancel-btn" onClick={onClose}>Done</button></div>
  </div></div>;
}
