import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import QRCode from "qrcode";
import { FaCamera, FaCheckCircle, FaMobileAlt, FaQrcode, FaTimes, FaUsb } from "react-icons/fa";
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
  const [assetTokens, setAssetTokens] = useState([]);
  const [assetScanValue, setAssetScanValue] = useState("");
  const [returnAssets, setReturnAssets] = useState([]);
  const [missingAssets, setMissingAssets] = useState([]);

  const clearResult = useCallback(() => {
    setResult(null); setVerified(false); setReturnRequest(null); setReturnForm(null);
    setAssetTokens([]); setReturnAssets([]); setMissingAssets([]); setAssetScanValue("");
  }, []);

  function selectReturnRequest(request) {
    setReturnAssets([]);
    setMissingAssets([]);
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
    if (!result) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => { if (event.key === "Escape" && !busy) clearResult(); };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", closeOnEscape); };
  }, [result, busy, clearResult]);

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
    if (normalized.startsWith("cthmasset.") && result) return result.mode === "return" ? lookupReturnAsset(normalized) : lookupAsset(normalized);
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

  async function lookupAsset(token) {
    const normalized = String(token ?? "").trim();
    if (!normalized || scanLock.current || !result?.request) return;
    scanLock.current = true; setBusy(true); setMessage("");
    try {
      const response = await authenticatedFetch("/api/qr/assets/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: normalized }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to read this asset QR.");
      const requested = result.request.items.find((item) => String(item.inventoryId) === String(body.asset.inventoryId) && item.trackingType === "serialized");
      if (!requested) throw new Error(`${body.asset.assetNumber} is not a serialized item in this request.`);
      if (body.asset.status !== "available" || !["good", "fair"].includes(body.asset.condition)) throw new Error(`${body.asset.assetNumber} is not available for release.`);
      if (assetTokens.some((entry) => entry.asset.id === body.asset.id)) throw new Error(`${body.asset.assetNumber} was already scanned.`);
      const count = assetTokens.filter((entry) => String(entry.asset.inventoryId) === String(requested.inventoryId)).length;
      if (count >= Number(requested.quantity)) throw new Error(`All required units of ${requested.name} are already scanned.`);
      setAssetTokens((current) => [...current, { token: normalized, asset: body.asset }]); setAssetScanValue("");
      setMessage(`${body.asset.assetNumber} added to the release.`);
    } catch (error) { setMessage(error.message); } finally { scanLock.current = false; setBusy(false); }
  }

  async function lookupReturnAsset(token) {
    const normalized = String(token ?? "").trim();
    if (!normalized || scanLock.current || !returnRequest) return;
    scanLock.current = true; setBusy(true); setMessage("");
    try {
      const response = await authenticatedFetch("/api/qr/assets/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: normalized }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to read this asset QR.");
      const requested = returnRequest.items.find((item) => String(item.inventoryId) === String(body.asset.inventoryId) && item.trackingType === "serialized");
      if (!requested) throw new Error(`${body.asset.assetNumber} is not a serialized item in this return.`);
      if (returnAssets.some((entry) => entry.asset.id === body.asset.id)) throw new Error(`${body.asset.assetNumber} was already scanned.`);
      if (missingAssets.some((entry) => entry.assetId === body.asset.id)) throw new Error(`${body.asset.assetNumber} is currently marked as missing. Undo that report before scanning it as returned.`);
      const count = returnAssets.filter((entry) => String(entry.asset.inventoryId) === String(requested.inventoryId)).length
        + missingAssets.filter((entry) => String(entry.inventoryId) === String(requested.inventoryId)).length;
      if (count >= Number(requested.outstandingQuantity)) throw new Error(`All outstanding units of ${requested.name} are already scanned.`);
      setReturnAssets((current) => [...current, { token: normalized, asset: body.asset, condition: "good", conditionNote: "" }]); setAssetScanValue("");
      setMessage(`${body.asset.assetNumber} added to the return.`);
    } catch (error) { setMessage(error.message); } finally { scanLock.current = false; setBusy(false); }
  }

  function reportMissing(asset, inventoryId) {
    if (returnAssets.some((entry) => entry.asset.id === asset.id)) { setMessage(`${asset.assetNumber} is already scanned as returned.`); return; }
    if (missingAssets.some((entry) => entry.assetId === asset.id)) return;
    const reason = window.prompt(`Explain why ${asset.assetNumber} is being reported missing:`)?.trim();
    if (!reason) return;
    if (reason.length < 5 || reason.length > 500) { setMessage("The missing-asset reason must contain 5 to 500 characters."); return; }
    if (!window.confirm(`Report ${asset.assetNumber} as missing? This will create an audited incident.`)) return;
    setMissingAssets((current) => [...current, { assetId: asset.id, assetNumber: asset.assetNumber, inventoryId, reason }]);
    setMessage(`${asset.assetNumber} marked for missing-asset incident reporting.`);
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
        body: JSON.stringify({ status: "Borrowed", claimToken: result.claimToken, identityVerified: true, assetTokens: assetTokens.map((entry) => entry.token) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to release the items.");
      setResult(null); setVerified(false); setAssetTokens([]); setMessage("Items released successfully. The borrowing deadline is now being tracked.");
    } catch (error) { setMessage(error.message); }
    finally { scanLock.current = false; setBusy(false); }
  }

  async function changeMode(nextMode) {
    if (nextMode === mode) return;
    await stopCamera();
    await closePairing();
    setMode(nextMode); setResult(null); setVerified(false); setReturnRequest(null); setReturnForm(null); setAssetTokens([]); setMessage("");
  }

  async function submitReturn(event) {
    event.preventDefault();
    if (!returnRequest || !returnForm || scanLock.current) return;
    const accounted = returnForm.items.reduce((sum, item) => sum + item.goodQuantity + item.damagedQuantity + item.missingQuantity, 0) + returnAssets.length + missingAssets.length;
    const exceeded = returnForm.items.find((item) => item.goodQuantity + item.damagedQuantity + item.missingQuantity > item.outstandingQuantity);
    const missingNote = returnForm.items.find((item) => (item.damagedQuantity > 0 || item.missingQuantity > 0) && item.conditionNote.trim().length < 5);
    if (!accounted || exceeded || missingNote) {
      setMessage(exceeded ? `Entered quantities exceed the outstanding units for ${exceeded.name}.`
        : missingNote ? `Add a condition note of at least 5 characters for damaged or missing units of ${missingNote.name}.`
          : "Enter at least one returned, damaged, or missing unit.");
      return;
    }
    scanLock.current = true; setBusy(true); setMessage("");
    try {
      const serializedCounts = new Map();
      for (const asset of returnAssets) {
        const key = String(asset.asset.inventoryId); const counts = serializedCounts.get(key) || { good: 0, damaged: 0 };
        if (asset.condition === "damaged") counts.damaged += 1; else counts.good += 1;
        serializedCounts.set(key, counts);
      }
      for (const asset of missingAssets) {
        const key = String(asset.inventoryId); const counts = serializedCounts.get(key) || { good: 0, damaged: 0, missing: 0 };
        counts.missing = (counts.missing || 0) + 1; serializedCounts.set(key, counts);
      }
      const submission = { ...returnForm, items: returnForm.items.map((item) => {
        const requested = returnRequest.items.find((entry) => String(entry.inventoryId) === String(item.inventoryId));
        if (requested?.trackingType !== "serialized") return item;
        const counts = serializedCounts.get(String(item.inventoryId)) || { good: 0, damaged: 0, missing: 0 };
        return { ...item, goodQuantity: counts.good || 0, damagedQuantity: counts.damaged || 0, missingQuantity: counts.missing || 0, conditionNote: (counts.damaged || counts.missing) ? "See individual serialized asset incident/condition notes." : "" };
      }), assets: returnAssets.map(({ token, condition, conditionNote }) => ({ token, condition, conditionNote })), missingAssets: missingAssets.map(({ assetId, reason }) => ({ assetId, reason })) };
      const response = await authenticatedFetch(`/api/borrowings/${returnRequest.id}/returns`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submission),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.reasons?.[0] || body.message || "Unable to record the return.");
      setResult(null); setReturnRequest(null); setReturnForm(null); setReturnAssets([]); setMissingAssets([]);
      setMessage(body.complete ? "Return completed. All items are accounted for." : "Partial return recorded. Outstanding items remain.");
    } catch (error) { setMessage(error.message); }
    finally { scanLock.current = false; setBusy(false); }
  }

  return <div className="qr-page scan-page">
    <header><div className="page-title-icon"><FaQrcode /></div><div><h1>QR Transaction Scanner</h1><p>Verify a borrower and securely process item claims or returns.</p></div></header>
    <div className="scan-mode-tabs" role="tablist" aria-label="QR transaction mode">
      <button type="button" role="tab" aria-selected={mode === "claim"} className={mode === "claim" ? "active" : ""} onClick={() => changeMode("claim")}>Claim Items</button>
      <button type="button" role="tab" aria-selected={mode === "return"} className={mode === "return" ? "active" : ""} onClick={() => changeMode("return")}>Return Items</button>
    </div>
    <section className="scanner-card">
      <div className="scanner-card-heading"><div><span className="scanner-step">Step 1</span><h2>Scan the borrower&apos;s account QR</h2><p>Use this computer&apos;s camera, pair a phone, or use a USB scanner.</p></div><div className="scanner-mode-badge"><FaQrcode /> {mode === "return" ? "Return mode" : "Claim mode"}</div></div>
      <div className={`camera-frame desktop-camera-frame ${cameraActive ? "active" : ""}`}>
        <div id="account-qr-reader" className="camera-reader" />
        {!cameraActive && <div className="camera-placeholder"><div className="camera-icon" aria-hidden="true"><FaCamera /></div><strong>Camera preview</strong><span>Select a scanning option below to begin</span></div>}
      </div>
      {cameras.length > 1 && !cameraActive && <label>Camera
        <select value={cameraId} onChange={(event) => setCameraId(event.target.value)}>{cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.label || "Camera"}</option>)}</select>
      </label>}
      <div className="scanner-actions">
        {!cameraActive ? <button type="button" onClick={startCamera} disabled={busy}><FaCamera /> Use This Device&apos;s Camera</button>
          : <button type="button" onClick={stopCamera}>Stop Camera</button>}
        {!pairing && <button type="button" className="secondary-button" onClick={createPairing} disabled={busy}><FaMobileAlt /> Use Phone as Scanner</button>}
      </div>
      {pairing && <div className="pairing-panel">
        <h2>Pair a phone</h2>
        <p>Scan this code with a phone signed in to the same staff account. It will scan an account for {mode === "return" ? "return processing" : "item claiming"}. The pairing expires in five minutes.</p>
        {pairingImage && <img src={pairingImage} alt="Temporary phone scanner pairing QR" />}
        <p className="pairing-state">{pairing.status === "connected" ? "Phone connected. Waiting for an account QR scan…" : "Waiting for the phone to connect…"}</p>
        <button type="button" className="secondary-button" onClick={closePairing}>Disconnect Phone</button>
      </div>}
      <form onSubmit={(event) => { event.preventDefault(); lookup(scanValue); }}>
        <label><span className="input-label-with-icon"><FaUsb /> USB scanner or manual token</span>
          <input autoFocus autoComplete="off" value={scanValue} onChange={(event) => setScanValue(event.target.value)} placeholder="Scan while this field is focused" />
        </label>
        <button type="submit" disabled={busy || !scanValue.trim()}>{busy ? "Checking..." : mode === "return" ? "Find Borrowed Items" : "Find Ready Request"}</button>
      </form>
      {message && <div className={/^(Items released|Return completed|Partial return|Account QR received|.* added to)/.test(message) ? "qr-feedback success" : "qr-feedback error"}>{/^(Items released|Return completed|Partial return|Account QR received|.* added to)/.test(message) && <FaCheckCircle />}<span>{message}</span></div>}
    </section>
    {result && result.mode !== "return" && <div className="transaction-result-overlay"><section className="claim-card transaction-result-dialog" role="dialog" aria-modal="true" aria-label="Verified borrowing request"><div className="result-dialog-top"><span className="result-status ready"><FaCheckCircle /> Verified request</span><button type="button" className="result-close" onClick={clearResult} aria-label="Close request"><FaTimes /></button></div>
      <h2>Ready for Claim · BR-{String(result.request.id).padStart(3, "0")}</h2>
      <dl><div><dt>Borrower</dt><dd>{result.borrower.fullName}</dd></div><div><dt>Student ID</dt><dd>{result.borrower.studentId || "Not applicable"}</dd></div>
        <div><dt>Borrow date</dt><dd>{String(result.request.borrowDate).slice(0, 10)}</dd></div><div><dt>Deadline</dt><dd>{String(result.request.returnDate).slice(0, 10)}</dd></div></dl>
      <div className="result-section-heading"><div><span className="scanner-step">Step 2</span><h3>Items to release</h3></div><span>{result.request.items.reduce((sum, item) => sum + Number(item.quantity), 0)} total units</span></div><ul className="request-item-list">{result.request.items.map((item) => <li key={item.inventoryId}><span><strong>{item.name}</strong><small>{item.trackingType === "serialized" ? "Individual asset scan required" : "Bulk quantity"}</small></span><b>× {item.quantity}</b></li>)}</ul>
      {result.request.items.some((item) => item.trackingType === "serialized") && <div className="serialized-scan-panel"><h3>Scan Serialized Assets</h3><p>Scan every physical unit required by this request.</p><form onSubmit={(event) => { event.preventDefault(); lookupAsset(assetScanValue); }}><input autoComplete="off" value={assetScanValue} onChange={(event) => setAssetScanValue(event.target.value)} placeholder="Scan an asset QR" /><button disabled={busy || !assetScanValue.trim()}>Add Asset</button></form>{result.request.items.filter((item) => item.trackingType === "serialized").map((item) => { const scanned = assetTokens.filter((entry) => String(entry.asset.inventoryId) === String(item.inventoryId)); return <div className="serialized-requirement" key={item.inventoryId}><strong>{item.name}: {scanned.length}/{item.quantity}</strong>{scanned.map((entry) => <span key={entry.asset.id}>{entry.asset.assetNumber}<button type="button" onClick={() => setAssetTokens((current) => current.filter((value) => value.asset.id !== entry.asset.id))}>Remove</button></span>)}</div>; })}</div>}
      <div className="request-purpose"><span>Purpose</span><p>{result.request.purpose}</p></div>
      <label className="identity-check"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} /> I compared the displayed borrower information with their school ID.</label>
      <button type="button" className="release-button" disabled={!verified || busy || result.request.items.some((item) => item.trackingType === "serialized" && assetTokens.filter((entry) => String(entry.asset.inventoryId) === String(item.inventoryId)).length !== Number(item.quantity))} onClick={release}>{busy ? "Rechecking inventory..." : "Release Items"}</button>
    </section></div>}
    {result?.mode === "return" && <div className="transaction-result-overlay"><section className="claim-card return-scan-card transaction-result-dialog" role="dialog" aria-modal="true" aria-label="Process borrowing return"><div className="result-dialog-top"><span className="result-status return"><FaCheckCircle /> Borrower verified</span><button type="button" className="result-close" onClick={clearResult} aria-label="Close return"><FaTimes /></button></div>
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
        {returnRequest.items.some((item) => item.trackingType === "serialized") && <div className="serialized-scan-panel"><h3>Scan Returned Assets</h3><div className="serialized-return-input"><input value={assetScanValue} onChange={(event) => setAssetScanValue(event.target.value)} placeholder="Scan an asset QR" /><button type="button" onClick={() => lookupReturnAsset(assetScanValue)} disabled={!assetScanValue.trim() || busy}>Add Asset</button></div>{returnAssets.map((entry, assetIndex) => <div className="serialized-return-row" key={entry.asset.id}><strong>{entry.asset.assetNumber}</strong><select value={entry.condition} onChange={(event) => setReturnAssets((current) => current.map((value, index) => index === assetIndex ? { ...value, condition: event.target.value } : value))}><option value="good">Good</option><option value="fair">Fair</option><option value="damaged">Damaged</option></select>{entry.condition === "damaged" && <input required minLength="5" maxLength="500" value={entry.conditionNote} placeholder="Damage details (at least 5 characters)" onChange={(event) => setReturnAssets((current) => current.map((value, index) => index === assetIndex ? { ...value, conditionNote: event.target.value } : value))} />}<button type="button" onClick={() => setReturnAssets((current) => current.filter((_, index) => index !== assetIndex))}>Remove</button></div>)}</div>}
        {returnRequest.items.filter((item) => item.trackingType === "serialized").map((item) => <div className="missing-asset-panel" key={`missing-${item.inventoryId}`}><h4>{item.name} assigned assets</h4>{(item.assets || []).map((asset) => { const returned = returnAssets.some((entry) => entry.asset.id === asset.id); const missing = missingAssets.find((entry) => entry.assetId === asset.id); return <div key={asset.id}><span>{asset.assetNumber}{asset.serialNumber ? ` · ${asset.serialNumber}` : ""}</span>{returned ? <em>Scanned for return</em> : missing ? <><em>Missing incident pending</em><button type="button" onClick={() => setMissingAssets((current) => current.filter((entry) => entry.assetId !== asset.id))}>Undo</button></> : <button type="button" className="danger-text" onClick={() => reportMissing(asset, item.inventoryId)}>Report Missing</button>}</div>; })}</div>)}
        {returnForm.items.map((item, index) => <section className="qr-return-item" key={item.inventoryId}>
          <div className="return-item-heading"><strong>{item.name}</strong><span>{item.outstandingQuantity} outstanding</span></div>
          <div className="return-fields">
            {[["goodQuantity", "Good"], ["damagedQuantity", "Damaged"], ["missingQuantity", "Missing"]].map(([field, label]) => <label key={field}>{label}
              <input type="number" min="0" max={item.outstandingQuantity} disabled={returnRequest.items.find((entry) => String(entry.inventoryId) === String(item.inventoryId))?.trackingType === "serialized"} value={item[field]} onChange={(event) => setReturnForm((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, [field]: Number(event.target.value) } : entry) }))} />
            </label>)}
          </div>
          <label>Condition note {(item.damagedQuantity > 0 || item.missingQuantity > 0) && <span className="required-note">Required</span>}
            <input maxLength="500" value={item.conditionNote} placeholder="Required for damaged or missing units" onChange={(event) => setReturnForm((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, conditionNote: event.target.value } : entry) }))} />
          </label>
        </section>)}
        <label>Return remarks<textarea rows="3" maxLength="1000" value={returnForm.remarks} onChange={(event) => setReturnForm({ ...returnForm, remarks: event.target.value })} /></label>
        <button className="release-button" type="submit" disabled={busy}>{busy ? "Recording return..." : "Record Return"}</button>
      </form>}
    </section></div>}
  </div>;
}
