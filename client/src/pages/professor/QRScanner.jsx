import { useCallback, useEffect, useRef, useState } from "react";
import { FaCamera, FaExclamationTriangle, FaKeyboard, FaQrcode, FaRedo, FaSearch } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import "../../styles/professor.css";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authorizationToken(value) {
  const input = String(value || "").trim();
  if (UUID.test(input)) return input;
  try {
    const url = new URL(input, window.location.origin);
    const match = url.pathname.match(/^\/authorize\/([^/]+)\/?$/);
    return match && UUID.test(match[1]) ? match[1] : null;
  } catch { return null; }
}

export default function QRScanner() {
  const navigate = useNavigate();
  const scanner = useRef(null);
  const handled = useRef(false);
  const [mode, setMode] = useState("camera");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [cameraState, setCameraState] = useState("Starting camera...");
  const [cameraAttempt, setCameraAttempt] = useState(0);

  const openReview = useCallback((value) => {
    const token = authorizationToken(value);
    if (!token) { setError("This is not a valid borrowing-authorization QR code."); return; }
    if (handled.current) return;
    handled.current = true;
    navigate(`/authorize/${token}`);
  }, [navigate]);

  useEffect(() => {
    if (mode !== "camera") return undefined;
    let cancelled = false;
    handled.current = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const instance = new Html5Qrcode("professor-authorization-reader");
        scanner.current = instance;
        await instance.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 240, height: 240 } }, openReview, () => {});
        if (!cancelled) setCameraState("Position the authorization QR code inside the frame.");
      } catch (cameraError) {
        if (!cancelled) {
          setCameraState("");
          const denied = cameraError?.name === "NotAllowedError" || /permission|denied/i.test(cameraError?.message || "");
          const missing = cameraError?.name === "NotFoundError" || /not found|no camera|requested device/i.test(cameraError?.message || "");
          setError(denied
            ? "Camera access is blocked. Allow camera permission for this site, then retry."
            : missing
              ? "No usable camera was detected on this device."
              : "The camera could not be started. Close other camera apps, then retry.");
        }
      }
    })();
    return () => {
      cancelled = true;
      const activeScanner = scanner.current;
      scanner.current = null;
      if (activeScanner?.isScanning) activeScanner.stop().catch(() => {}).finally(() => activeScanner.clear());
      else activeScanner?.clear?.();
    };
  }, [mode, openReview, cameraAttempt]);

  const useCamera = () => {
    if (mode === "camera" && !error) return;
    setError("");
    setCameraState("Starting camera...");
    setMode("camera");
    setCameraAttempt((attempt) => attempt + 1);
  };

  return <div className="professor-qr-page">
    <div className="professor-page-header"><div><div className="professor-page-eyebrow">PROFESSOR PORTAL</div><h1>Authorization QR Scanner</h1><p>Scan the QR generated for a borrowing request, then review and sign it securely.</p></div></div>
    <div className="professor-qr-mode-bar"><button type="button" className={mode === "camera" ? "active" : ""} onClick={useCamera}><FaCamera /> Camera Scanner</button><button type="button" className={mode === "manual" ? "active" : ""} onClick={() => { setMode("manual"); setError(""); }}><FaKeyboard /> Enter QR Code</button></div>
    <div className={`professor-qr-layout ${mode === "camera" && error ? "camera-error" : ""}`}>
      <div className="professor-qr-card"><div className="professor-qr-card-header"><div><h2>{mode === "camera" ? "Scan QR Code" : "Enter QR Code"}</h2><p>Only borrowing-authorization QR codes are accepted.</p></div><FaQrcode /></div>
        {mode === "camera" ? <div className={`professor-qr-camera ${error ? "has-error" : ""}`}><div id="professor-authorization-reader" className="professor-authorization-reader" />{error ? <div className="professor-camera-error" role="alert"><FaExclamationTriangle /><strong>Camera unavailable</strong><span>{error}</span><div><button type="button" onClick={useCamera}><FaRedo /> Retry Camera</button><button type="button" onClick={() => { setMode("manual"); setError(""); }}><FaKeyboard /> Enter Code Instead</button></div></div> : <span>{cameraState}</span>}</div> : <div className="professor-qr-manual"><label htmlFor="professor-authorization-code">Authorization link or token</label><div className="professor-qr-input"><FaQrcode /><input id="professor-authorization-code" value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") openReview(code); }} placeholder="Paste QR link or UUID..." /></div><button type="button" className="professor-qr-verify-btn" onClick={() => openReview(code)}><FaSearch /> Open Request</button>{error && <p className="form-error" role="alert">{error}</p>}</div>}
      </div>
      <div className="professor-qr-card"><div className="professor-qr-empty"><FaQrcode /><strong>Scanning does not sign the request</strong><span>You will always see the official form and must explicitly confirm before your saved signature is applied.</span></div></div>
    </div>
  </div>;
}
