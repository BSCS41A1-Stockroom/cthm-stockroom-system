import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FaCamera, FaCheckCircle, FaQrcode, FaShieldAlt } from "react-icons/fa";
import { authenticatedFetch } from "../../lib/api";
import "../../styles/qr.css";

export default function MobileQrScanner() {
  const [params] = useSearchParams();
  const pairToken = params.get("pair") || "";
  const scanner = useRef(null);
  const locked = useRef(false);
  const [connection, setConnection] = useState("connecting");
  const [cameraActive, setCameraActive] = useState(false);
  const [message, setMessage] = useState("Connecting securely to the PC...");

  async function stopCamera() {
    const current = scanner.current;
    scanner.current = null;
    if (current?.isScanning) await current.stop().catch(() => {});
    await current?.clear().catch(() => {});
    setCameraActive(false);
  }

  useEffect(() => {
    let active = true;
    async function join() {
      if (!pairToken.startsWith("pair.v1.")) {
        setConnection("error"); setMessage("This pairing link is invalid."); return;
      }
      try {
        const response = await authenticatedFetch("/api/qr/pairings/join", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pairToken }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "Unable to connect to the PC.");
        if (active) { setConnection("connected"); setMessage("Connected to the PC. Tap Start Camera when you are ready."); }
      } catch (error) {
        if (active) { setConnection("error"); setMessage(error.message); }
      }
    }
    join();
    return () => {
      active = false;
      const current = scanner.current;
      if (current?.isScanning) current.stop().catch(() => {});
    };
  }, [pairToken]);

  async function sendScan(accountToken, instance) {
    if (locked.current) return;
    locked.current = true; setMessage("Checking the account QR...");
    try {
      const response = await authenticatedFetch("/api/qr/pairings/scan", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pairToken, accountToken }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to send this scan.");
      setConnection("complete"); setMessage("Scan sent successfully. Continue on the paired PC.");
      await instance.stop(); await instance.clear(); scanner.current = null; setCameraActive(false);
    } catch (error) {
      setMessage(error.message); locked.current = false;
    }
  }

  async function startCamera() {
    if (connection !== "connected" || cameraActive) return;
    setMessage("Requesting camera permission...");
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const instance = new Html5Qrcode("mobile-account-reader");
      scanner.current = instance;
      await instance.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: (width, height) => { const size = Math.min(width, height, 280) * 0.78; return { width: size, height: size }; } },
        (accountToken) => sendScan(accountToken, instance),
        () => {}
      );
      setCameraActive(true); setMessage("Point the camera at the borrower’s account QR.");
    } catch (error) {
      const current = scanner.current;
      scanner.current = null;
      if (current?.isScanning) await current.stop().catch(() => {});
      await current?.clear().catch(() => {});
      setCameraActive(false);
      setMessage(error?.message || "Camera could not be opened. Check browser camera permission and try again.");
    }
  }

  return <main className="mobile-scanner-page">
    <section className="mobile-scanner-card">
      <div className="mobile-scanner-brand"><FaShieldAlt /> CTHM Stockroom</div>
      <h1>Phone QR Scanner</h1>
      <div className={`connection-badge ${connection}`}><span />{connection === "connected" ? "Phone connected" : connection === "complete" ? "Scan delivered" : connection === "error" ? "Connection problem" : "Connecting"}</div>
      <p className="mobile-scanner-message" role="status">{connection === "complete" ? <FaCheckCircle aria-hidden="true" /> : <FaQrcode aria-hidden="true" />}<span>{message}</span></p>
      <div className={`camera-frame ${cameraActive ? "active" : ""}`}>
        <div id="mobile-account-reader" className="camera-reader" />
        {!cameraActive && connection !== "complete" && <div className="camera-placeholder"><div className="camera-icon" aria-hidden="true"><FaCamera /></div><strong>Camera preview</strong><span>Your camera will appear here after permission is granted</span></div>}
      </div>
      <div className="mobile-scanner-actions">
        {!cameraActive && connection !== "complete" && <button type="button" onClick={startCamera} disabled={connection !== "connected"}><FaCamera /> Start Camera</button>}
        {cameraActive && <button type="button" className="secondary-button" onClick={stopCamera}>Stop Camera</button>}
      </div>
      <p className="qr-warning">Camera access requires HTTPS and browser permission. After scanning, verify and release the items from the paired PC.</p>
    </section>
  </main>;
}
