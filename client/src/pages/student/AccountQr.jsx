import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { authenticatedFetch } from "../../lib/api";
import "../../styles/qr.css";

export default function AccountQr() {
  const [image, setImage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadQr = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await authenticatedFetch("/api/qr/me");
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to load your QR code.");
      setImage(await QRCode.toDataURL(result.token, { width: 360, margin: 2, errorCorrectionLevel: "M" }));
    } catch (caught) { setError(caught.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadQr, 0);
    return () => window.clearTimeout(timer);
  }, [loadQr]);

  async function regenerate() {
    if (!window.confirm("Regenerate your account QR? Your previous QR code will stop working immediately.")) return;
    setLoading(true); setError("");
    try {
      const response = await authenticatedFetch("/api/qr/me/regenerate", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to regenerate your QR code.");
      setImage(await QRCode.toDataURL(result.token, { width: 360, margin: 2, errorCorrectionLevel: "M" }));
    } catch (caught) { setError(caught.message); }
    finally { setLoading(false); }
  }

  return <div className="qr-page">
    <header><h1>My Account QR</h1><p>Present this code to stockroom staff when claiming or returning equipment.</p></header>
    <section className="qr-card">
      {loading && <p>Generating secure QR code...</p>}
      {error && <p className="form-error">{error}</p>}
      {image && !loading && <img src={image} alt="Your secure CTHM account QR code" />}
      <p className="qr-warning">This code identifies your account. Do not share it. Staff must still verify your school ID before releasing items.</p>
      <div className="qr-actions">
        {image && <a href={image} download="cthm-account-qr.png">Download QR</a>}
        <button type="button" onClick={regenerate} disabled={loading}>Regenerate QR</button>
      </div>
    </section>
  </div>;
}
