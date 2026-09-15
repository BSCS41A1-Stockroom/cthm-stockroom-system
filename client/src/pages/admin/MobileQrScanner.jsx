import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { authenticatedFetch } from "../../lib/api";
import "../../styles/qr.css";

export default function MobileQrScanner() {
  const [params] = useSearchParams();
  const pairToken = params.get("pair") || "";
  const scanner = useRef(null);
  const locked = useRef(false);
  const [state, setState] = useState("Starting camera…");

  useEffect(() => {
    let active = true;
    async function start() {
      if (!pairToken.startsWith("pair.v1.")) { setState("This pairing link is invalid."); return; }
      try {
        const joinResponse = await authenticatedFetch("/api/qr/pairings/join", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pairToken }),
        });
        const joinBody = await joinResponse.json();
        if (!joinResponse.ok) throw new Error(joinBody.message || "Unable to connect to the PC.");
        const { Html5Qrcode } = await import("html5-qrcode");
        const instance = new Html5Qrcode("mobile-account-reader");
        scanner.current = instance;
        await instance.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, async (accountToken) => {
          if (locked.current || !active) return;
          locked.current = true; setState("Checking account QR…");
          try {
            const response = await authenticatedFetch("/api/qr/pairings/scan", {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pairToken, accountToken }),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.message || "Unable to send this scan.");
            setState("Scan sent. Continue on the paired PC.");
            await instance.stop();
          } catch (error) { setState(error.message); locked.current = false; }
        }, () => {});
        if (active) setState("Point the camera at the borrower’s account QR.");
      } catch (error) { if (active) setState(error?.message || "Camera could not be opened."); }
    }
    start();
    return () => { active = false; const current = scanner.current; if (current?.isScanning) current.stop().catch(() => {}); };
  }, [pairToken]);

  return <main className="mobile-scanner-page">
    <h1>Phone QR Scanner</h1>
    <p>{state}</p>
    <div id="mobile-account-reader" className="camera-reader" />
    <p className="qr-warning">Keep this page open until the PC receives the request. The PC must still verify the borrower and confirm release.</p>
  </main>;
}
