import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { authenticatedFetch } from "../../../lib/api";

const STATUS_LABELS = {
  not_issued: "Not Issued",
  active: "Active",
  revoked: "Revoked",
  replacement_required: "Replacement Required",
};

export default function QrManagementModal({ user, onClose, onUpdated }) {
  const [record, setRecord] = useState(null);
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [action, setAction] = useState("");
  const [reason, setReason] = useState("");

  const applyRecord = useCallback(async (next) => {
    setRecord(next);
    setImage(next.token ? await QRCode.toDataURL(next.token, { width: 420, margin: 2, errorCorrectionLevel: "M" }) : "");
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setBusy(true); setError("");
      try {
        const response = await authenticatedFetch(`/api/qr/users/${user.user_id}`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "Unable to load this QR record.");
        if (active) await applyRecord(body);
      } catch (caught) { if (active) setError(caught.message); }
      finally { if (active) setBusy(false); }
    }
    load();
    return () => { active = false; };
  }, [applyRecord, user.user_id]);

  function requestAction(nextAction) {
    setReason(""); setError(""); setAction(nextAction);
  }

  async function confirmAction() {
    if (!action) return;
    if (["revoke", "replace"].includes(action) && (reason.trim().length < 5 || reason.trim().length > 500)) {
      setError("Enter a reason between 5 and 500 characters."); return;
    }
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/qr/users/${user.user_id}/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason.trim() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || `Unable to ${action} this QR.`);
      await applyRecord(body); setAction(""); setReason(""); onUpdated?.();
    } catch (caught) { setError(caught.message); }
    finally { setBusy(false); }
  }

  async function printQr() {
    if (!record?.token || !image) return;
    setBusy(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/qr/users/${user.user_id}/print`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to prepare this QR for printing.");
      await applyRecord(body); onUpdated?.();
      window.print();
    } catch (caught) { setError(caught.message); }
    finally { setBusy(false); }
  }

  return <div className="modal-overlay qr-admin-overlay" onClick={() => !busy && onClose()}>
    <section className="qr-admin-modal" role="dialog" aria-modal="true" aria-labelledby="qr-admin-title" onClick={(event) => event.stopPropagation()}>
      <div className="qr-admin-header"><div><h2 id="qr-admin-title">Physical Account QR</h2><p>{user.full_name} · {user.student_id}</p></div><button type="button" className="qr-close" onClick={onClose} aria-label="Close">×</button></div>
      {busy && !record && <p>Loading QR record...</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {record && <>
        <div className="qr-admin-status"><span className={`qr-status ${record.status}`}>{STATUS_LABELS[record.status] || record.status}</span><div><span>{record.issuedAt ? `Issued ${new Date(record.issuedAt).toLocaleString()}` : "Not physically issued"}</span>{record.lastPrintedAt && <span>Last print prepared {new Date(record.lastPrintedAt).toLocaleString()}</span>}</div></div>
        {image ? <div className="qr-admin-preview"><img src={image} alt={`Account QR for ${record.fullName}`} /><p>CTHM Stockroom · {record.studentId}</p></div>
          : <div className="qr-unavailable">This QR is revoked. Generate a replacement before printing or issuing it.</div>}
        {record.revocationReason && <p className="qr-reason"><strong>Latest reason:</strong> {record.revocationReason}</p>}
        <div className="qr-admin-actions">
          {record.status !== "revoked" && record.status !== "active" && <button type="button" onClick={() => requestAction("issue")}>Mark as Issued</button>}
          {record.token && <button type="button" className="secondary" onClick={printQr}>Print Label</button>}
          {record.status === "active" && <button type="button" className="danger" onClick={() => requestAction("revoke")}>Revoke QR</button>}
          {["revoked", "active"].includes(record.status) && <button type="button" className="secondary" onClick={() => requestAction("replace")}>Generate Replacement</button>}
        </div>
      </>}
      {action && <div className="qr-confirm-panel">
        <h3>{action === "issue" ? "Confirm physical issuance" : action === "revoke" ? "Revoke this QR?" : "Generate a replacement?"}</h3>
        <p>{action === "issue" ? "Confirm that this QR label has been physically given to the correct student." : "The currently printed QR will stop working immediately."}</p>
        {["revoke", "replace"].includes(action) && <label>Reason<textarea rows="3" minLength="5" maxLength="500" value={reason} onChange={(event) => setReason(event.target.value)} /></label>}
        <div><button type="button" disabled={busy} onClick={() => setAction("")}>Cancel</button><button type="button" className={action === "revoke" ? "danger" : ""} disabled={busy} onClick={confirmAction}>{busy ? "Saving..." : "Confirm"}</button></div>
      </div>}
      {record && image && <div className="physical-qr-print-sheet" aria-hidden="true"><article className="physical-qr-label"><div className="print-brand">CTHM Stockroom</div><img src={image} alt="" /><strong>{record.fullName}</strong><span>{record.studentId}</span><small>{record.issuedAt ? `Issued ${new Date(record.issuedAt).toLocaleDateString()}` : "Not yet issued"}</small></article></div>}
    </section>
  </div>;
}
