import { useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import QRCode from "qrcode";
import "../../styles/qr.css";

export default function ScanQr() {
  const scanner = useRef(null);
  const scanLock = useRef(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [scanValue, setScanValue] = useState("");
  const [result, setResult] = useState(null);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pairing, setPairing] = useState(null);
  const [pairingImage, setPairingImage] = useState("");
  const [cameras, setCameras] = useState([]);
  const [cameraId, setCameraId] = useState("");
  const [mode, setMode] = useState("claim");
  const [returnRequest, setReturnRequest] = useState(null);
  const [returnForm, setReturnForm] = useState(null);

  function selectReturnRequest(request) {
    if (!request) { setReturnRequest(null); setReturnForm(null); return; }
    setReturnRequest(request);
    setReturnForm({ idempotencyKey: crypto.randomUUID(), remarks: "", items: request.items.map((item) => ({
      inventoryId: item.inventoryId, name: item.name, outstandingQuantity: Number(item.outstandingQuantity),
      goodQuantity: 0, damagedQuantity: 0, missingQuantity: 0, conditionNote: "",
    })) });
  }

  async function stopCamera() {
    const current = scanner.current;
    scanner.current = null;
    if (current?.isScanning) await current.stop().catch(() => {});
    await current?.clear().catch(() => {});
    setCameraActive(false);
  }

  useEffect(() => () => { const current = scanner.current; if (current?.isScanning) current.stop().catch(() => {}); }, []);

  useEffect(() => {
    if (!pairing?.id) return undefined;
    let active = true;
    let received = false;
    const receive = async () => {
      if (received) return;
      try {
        const response = await authenticatedFetch(`/api/qr/pairings/${pairing.id}`);
        if (!active) return;
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "Unable to receive the phone scan.");
        if (!body.request) {
          setPairing((current) => current?.id === pairing.id ? { ...current, status: body.status } : current);
          return;
        }
        if (active) {
          received = true;
          setResult(body); setVerified(false); setMessage("Account QR received from the paired phone.");
          if (body.mode === "return" && body.requests.length === 1) selectReturnRequest(body.requests[0]);
          authenticatedFetch(`/api/qr/pairings/${pairing.id}`, { method: "DELETE" }).catch(() => {});
          setPairing(null); setPairingImage("");
        }
      } catch (error) { if (active) setMessage(error.message); }
    };
    const channel = supabase.channel(`scanner-pairing-${pairing.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "qr_scanner_sessions", filter: `id=eq.${pairing.id}` }, receive)
      .subscribe();
    const fallback = window.setInterval(receive, 3000);
    return () => { active = false; window.clearInterval(fallback); supabase.removeChannel(channel); };
  }, [pairing?.id]);

  async function lookup(token) {
    const normalized = String(token ?? "").trim();
    if (!normalized || scanLock.current) return;
    scanLock.current = true;
    setBusy(true); setMessage(""); setResult(null); setVerified(false);
    try {
      const response = await authenticatedFetch("/api/qr/lookup", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: normalized, mode }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to read this account QR.");
      setResult(body); setScanValue("");
      if (body.mode === "return" && body.requests.length === 1) selectReturnRequest(body.requests[0]);
      await stopCamera();
    } catch (error) { setMessage(error.message); }
    finally { scanLock.current = false; setBusy(false); }
  }

  async function startCamera() {
    setMessage("");
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const available = await Html5Qrcode.getCameras();
      setCameras(available);
      if (available.length > 1 && !cameraId) {
        setCameraId(available.find((camera) => /back|rear|environment/i.test(camera.label))?.id || available[0].id);
        setMessage("Choose the camera you want to use, then click the camera button again.");
        return;
      }
      const selected = cameraId || available.find((camera) => /back|rear|environment/i.test(camera.label))?.id || available[0]?.id;
      if (!selected) throw new Error("No camera was detected on this device.");
      setCameraId(selected);
      const instance = new Html5Qrcode("account-qr-reader");
      scanner.current = instance;
      await instance.start(selected, { fps: 10, qrbox: { width: 240, height: 240 } }, (text) => lookup(text), () => {});
      setCameraActive(true);
    } catch (error) {
      const current = scanner.current;
      scanner.current = null;
      if (current?.isScanning) await current.stop().catch(() => {});
      await current?.clear().catch(() => {});
      setMessage(error?.message || "Camera could not be started. Allow camera access or use the scanner input.");
    }
  }

  async function createPairing() {
    setBusy(true); setMessage(""); setResult(null);
    try {
      const response = await authenticatedFetch("/api/qr/pairings", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to create phone pairing.");
      const url = `${window.location.origin}/admin/scan/mobile?pair=${encodeURIComponent(body.pairToken)}`;
      setPairing(body);
      setPairingImage(await QRCode.toDataURL(url, { width: 300, margin: 2, errorCorrectionLevel: "M" }));
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  async function closePairing() {
    if (pairing?.id) await authenticatedFetch(`/api/qr/pairings/${pairing.id}`, { method: "DELETE" }).catch(() => {});
    setPairing(null); setPairingImage("");
  }

  async function release() {
    if (!result || !verified || scanLock.current) return;
    scanLock.current = true;
    setBusy(true); setMessage("");
    try {
      const response = await authenticatedFetch(`/api/borrowings/${result.request.id}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Borrowed", claimToken: result.claimToken, identityVerified: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to release the items.");
      setResult(null); setVerified(false); setMessage("Items released successfully. The borrowing deadline is now being tracked.");
    } catch (error) { setMessage(error.message); }
    finally { scanLock.current = false; setBusy(false); }
  }

  async function changeMode(nextMode) {
    if (nextMode === mode) return;
    await stopCamera();
    await closePairing();
    setMode(nextMode); setResult(null); setVerified(false); setReturnRequest(null); setReturnForm(null); setMessage("");
  }

  async function submitReturn(event) {
    event.preventDefault();
    if (!returnRequest || !returnForm || scanLock.current) return;
    const accounted = returnForm.items.reduce((sum, item) => sum + item.goodQuantity + item.damagedQuantity + item.missingQuantity, 0);
    const exceeded = returnForm.items.find((item) => item.goodQuantity + item.damagedQuantity + item.missingQuantity > item.outstandingQuantity);
    const missingNote = returnForm.items.find((item) => (item.damagedQuantity > 0 || item.missingQuantity > 0) && !item.conditionNote.trim());
    if (!accounted || exceeded || missingNote) {
      setMessage(exceeded ? `Entered quantities exceed the outstanding units for ${exceeded.name}.`
        : missingNote ? `Add a condition note for damaged or missing units of ${missingNote.name}.`
          : "Enter at least one returned, damaged, or missing unit.");
      return;
    }
    scanLock.current = true; setBusy(true); setMessage("");
    try {
      const response = await authenticatedFetch(`/api/borrowings/${returnRequest.id}/returns`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(returnForm),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.reasons?.[0] || body.message || "Unable to record the return.");
      setResult(null); setReturnRequest(null); setReturnForm(null);
      setMessage(body.complete ? "Return completed. All items are accounted for." : "Partial return recorded. Outstanding items remain.");
    } catch (error) { setMessage(error.message); }
    finally { scanLock.current = false; setBusy(false); }
  }

  return <div className="qr-page scan-page">
    <header><h1>Scan Account QR</h1><p>Scan a borrower&apos;s account QR to claim requested items or process a return.</p></header>
    <div className="scan-mode-tabs" role="tablist" aria-label="QR transaction mode">
      <button type="button" role="tab" aria-selected={mode === "claim"} className={mode === "claim" ? "active" : ""} onClick={() => changeMode("claim")}>Claim Items</button>
      <button type="button" role="tab" aria-selected={mode === "return"} className={mode === "return" ? "active" : ""} onClick={() => changeMode("return")}>Return Items</button>
    </div>
    <section className="scanner-card">
      <div className={`camera-frame desktop-camera-frame ${cameraActive ? "active" : ""}`}>
        <div id="account-qr-reader" className="camera-reader" />
        {!cameraActive && <div className="camera-placeholder"><div className="camera-icon" aria-hidden="true">▣</div><span>Select a camera option below to begin scanning</span></div>}
      </div>
      {cameras.length > 1 && !cameraActive && <label>Camera
        <select value={cameraId} onChange={(event) => setCameraId(event.target.value)}>{cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.label || "Camera"}</option>)}</select>
      </label>}
      <div className="scanner-actions">
        {!cameraActive ? <button type="button" onClick={startCamera} disabled={busy}>Use This Device&apos;s Camera</button>
          : <button type="button" onClick={stopCamera}>Stop Camera</button>}
        {!pairing && <button type="button" className="secondary-button" onClick={createPairing} disabled={busy}>Use Phone as Scanner</button>}
      </div>
      {pairing && <div className="pairing-panel">
        <h2>Pair a phone</h2>
        <p>Scan this code with a phone signed in to the same staff account. It will scan an account for {mode === "return" ? "return processing" : "item claiming"}. The pairing expires in five minutes.</p>
        {pairingImage && <img src={pairingImage} alt="Temporary phone scanner pairing QR" />}
        <p className="pairing-state">{pairing.status === "connected" ? "Phone connected. Waiting for an account QR scan…" : "Waiting for the phone to connect…"}</p>
        <button type="button" className="secondary-button" onClick={closePairing}>Disconnect Phone</button>
      </div>}
      <form onSubmit={(event) => { event.preventDefault(); lookup(scanValue); }}>
        <label>USB scanner or manual token
          <input autoFocus autoComplete="off" value={scanValue} onChange={(event) => setScanValue(event.target.value)} placeholder="Scan while this field is focused" />
        </label>
        <button type="submit" disabled={busy || !scanValue.trim()}>{busy ? "Checking..." : mode === "return" ? "Find Borrowed Items" : "Find Ready Request"}</button>
      </form>
      {message && <p className={/^(Items released|Return completed|Partial return|Account QR received)/.test(message) ? "qr-success" : "form-error"}>{message}</p>}
    </section>
    {result && result.mode !== "return" && <section className="claim-card">
      <h2>Ready for Claim · BR-{String(result.request.id).padStart(3, "0")}</h2>
      <dl><div><dt>Borrower</dt><dd>{result.borrower.fullName}</dd></div><div><dt>Student ID</dt><dd>{result.borrower.studentId || "Not applicable"}</dd></div>
        <div><dt>Borrow date</dt><dd>{String(result.request.borrowDate).slice(0, 10)}</dd></div><div><dt>Deadline</dt><dd>{String(result.request.returnDate).slice(0, 10)}</dd></div></dl>
      <h3>Items to release</h3><ul>{result.request.items.map((item) => <li key={item.inventoryId}><span>{item.name}</span><strong>× {item.quantity}</strong></li>)}</ul>
      <p><strong>Purpose:</strong> {result.request.purpose}</p>
      <label className="identity-check"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} /> I compared the displayed borrower information with their school ID.</label>
      <button type="button" className="release-button" disabled={!verified || busy} onClick={release}>{busy ? "Rechecking inventory..." : "Release Items"}</button>
    </section>}
    {result?.mode === "return" && <section className="claim-card return-scan-card">
      <h2>Process Return</h2>
      <p><strong>Borrower:</strong> {result.borrower.fullName} · {result.borrower.studentId || "No student ID"}</p>
      {result.requests.length > 1 && <label className="return-request-select">Borrowing transaction
        <select value={returnRequest?.id || ""} onChange={(event) => selectReturnRequest(result.requests.find((request) => String(request.id) === event.target.value))}>
          <option value="">Select a borrowing request</option>
          {result.requests.map((request) => <option key={request.id} value={request.id}>BR-{String(request.id).padStart(3, "0")} · Due {String(request.returnDate).slice(0, 10)}</option>)}
        </select>
      </label>}
      {returnRequest && returnForm && <form className="qr-return-form" onSubmit={submitReturn}>
        <div className="return-summary"><span>BR-{String(returnRequest.id).padStart(3, "0")}</span><span>Due {String(returnRequest.returnDate).slice(0, 10)}</span></div>
        {returnForm.items.map((item, index) => <section className="qr-return-item" key={item.inventoryId}>
          <div className="return-item-heading"><strong>{item.name}</strong><span>{item.outstandingQuantity} outstanding</span></div>
          <div className="return-fields">
            {[["goodQuantity", "Good"], ["damagedQuantity", "Damaged"], ["missingQuantity", "Missing"]].map(([field, label]) => <label key={field}>{label}
              <input type="number" min="0" max={item.outstandingQuantity} value={item[field]} onChange={(event) => setReturnForm((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, [field]: Number(event.target.value) } : entry) }))} />
            </label>)}
          </div>
          <label>Condition note {(item.damagedQuantity > 0 || item.missingQuantity > 0) && <span className="required-note">Required</span>}
            <input maxLength="500" value={item.conditionNote} placeholder="Required for damaged or missing units" onChange={(event) => setReturnForm((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, conditionNote: event.target.value } : entry) }))} />
          </label>
        </section>)}
        <label>Return remarks<textarea rows="3" maxLength="1000" value={returnForm.remarks} onChange={(event) => setReturnForm({ ...returnForm, remarks: event.target.value })} /></label>
        <button className="release-button" type="submit" disabled={busy}>{busy ? "Recording return..." : "Record Return"}</button>
      </form>}
    </section>}
  </div>;
}
