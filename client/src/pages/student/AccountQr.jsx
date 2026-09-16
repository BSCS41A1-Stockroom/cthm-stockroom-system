import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { FaDownload, FaIdCard, FaLock, FaQrcode, FaShieldAlt } from "react-icons/fa";
import { authenticatedFetch } from "../../lib/api";
import { useAuth } from "../../auth/useAuth";
import "../../styles/qr.css";

export default function AccountQr() {
  const { profile } = useAuth();
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

  return <div className="qr-page account-qr-page">
    <header><div className="page-title-icon"><FaQrcode /></div><div><h1>My Account QR</h1><p>Present this secure code at the stockroom when claiming or returning equipment.</p></div></header>
    <div className="account-qr-layout">
      <section className="qr-card account-id-card">
        <div className="account-card-brand"><span><FaShieldAlt /> CTHM Stockroom</span><em>Official account QR</em></div>
        <div className="qr-code-frame">
          {loading && <div className="qr-loading"><span className="qr-spinner" /><p>Generating your secure code…</p></div>}
          {error && <div className="qr-error-state"><FaQrcode /><p>{error}</p><button type="button" onClick={loadQr}>Try Again</button></div>}
          {image && !loading && <img src={image} alt="Your secure CTHM account QR code" />}
          {image && !loading && <span className="qr-scan-corners" aria-hidden="true" />}
        </div>
        <div className="account-card-person"><div className="account-card-avatar"><FaIdCard /></div><div><strong>{profile?.full_name || "Student Account"}</strong><span>{profile?.student_id || "Student ID not available"}</span></div><span className="account-qr-active">Active</span></div>
        <div className="account-card-footer"><FaLock /><span>Signed credential · Personal and non-transferable</span></div>
      </section>
      <aside className="qr-guidance-card">
        <div className="guidance-icon"><FaShieldAlt /></div><h2>Keep your QR secure</h2><p>This code identifies your account and approved request. It does not contain your personal details in readable form.</p>
        <ol><li><span>1</span><div><strong>Present your school ID</strong><small>Show the printed QR attached to your ID.</small></div></li><li><span>2</span><div><strong>Staff scans the code</strong><small>Your approved request appears on their screen.</small></div></li><li><span>3</span><div><strong>Verify and receive items</strong><small>Staff confirms your identity before release.</small></div></li></ol>
        <div className="qr-warning"><FaShieldAlt /><span>Never send this QR to another person. Contact the stockroom immediately if it is lost, damaged, or copied.</span></div>
        <div className="qr-actions">{image && <a href={image} download="cthm-account-qr.png"><FaDownload /> Download Copy</a>}</div>
      </aside>
    </div>
  </div>;
}
