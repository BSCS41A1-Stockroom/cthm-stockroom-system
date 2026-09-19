import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  FaDownload,
  FaIdCard,
  FaLock,
  FaQrcode,
  FaShieldAlt,
} from "react-icons/fa";
import { authenticatedFetch } from "../../lib/api";
import { useAuth } from "../../auth/useAuth";
import "../../styles/qr.css";

export default function AccountQr() {
  const { profile } = useAuth();

  const [qrData, setQrData] = useState("");
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadQr = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await authenticatedFetch("/api/qr/me");
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Unable to load your QR code."
        );
      }

      if (!result.token) {
        throw new Error("No QR token was returned.");
      }

      const image = await QRCode.toDataURL(result.token, {
        width: 360,
        margin: 2,
        errorCorrectionLevel: "M",
      });

      setQrData(image);
      setAccount(result);
    } catch (err) {
      console.error("QR load error:", err);
      setError(
        err.message ||
          "Unable to load your QR code. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQr();
  }, [loadQr]);

  const accountName =
    account?.full_name ||
    account?.name ||
    profile?.full_name ||
    "Student";

  const studentId =
    account?.student_id ||
    account?.studentId ||
    profile?.student_id ||
    "—";

  const qrStatus =
    account?.status ||
    "Active";

  const handleDownload = () => {
    if (!qrData) return;

    const link = document.createElement("a");
    link.href = qrData;
    link.download = `student-qr-${studentId || "account"}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  if (loading) {
    return (
      <main className="qr-page">
        <header className="qr-page-header">
          <div>
            <span className="qr-eyebrow">STUDENT SERVICES</span>
            <h1>My QR Code</h1>
            <p>
              Your secure identification QR code for CTHM
              stockroom transactions.
            </p>
          </div>
        </header>

        <section className="qr-state-card">
          <div className="qr-loading-spinner" />
          <h2>Loading QR Code</h2>
          <p>Please wait while your secure QR code is prepared.</p>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="qr-page">
        <header className="qr-page-header">
          <div>
            <span className="qr-eyebrow">STUDENT SERVICES</span>
            <h1>My QR Code</h1>
            <p>
              Your secure identification QR code for CTHM
              stockroom transactions.
            </p>
          </div>
        </header>

        <section className="qr-state-card qr-state-card--error">
          <div className="qr-state-icon">
            <FaShieldAlt />
          </div>

          <h2>QR Code Unavailable</h2>

          <p>{error}</p>

          <button
            type="button"
            className="qr-primary-btn"
            onClick={loadQr}
          >
            Try Again
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="qr-page">
      <header className="qr-page-header">
        <div>
          <span className="qr-eyebrow">STUDENT SERVICES</span>

          <h1>My QR Code</h1>

          <p>
            Your secure identification QR code for CTHM
            stockroom transactions.
          </p>
        </div>
      </header>

      <section className="qr-account-layout">
        <div className="qr-card qr-card-main">
          <div className="qr-card-header">
            <div>
              <span className="qr-card-eyebrow">
                DIGITAL IDENTIFICATION
              </span>

              <h2>Student QR Code</h2>

              <p>
                Present this QR code when your identity needs
                to be verified for stockroom transactions.
              </p>
            </div>

            <div className="qr-header-icon">
              <FaQrcode />
            </div>
          </div>

          <div className="qr-display-area">
            <div className="qr-frame">
              {qrData && (
                <img
                  src={qrData}
                  alt="Student identification QR code"
                />
              )}
            </div>

            <div className="qr-scan-label">
              <FaQrcode />
              <span>Scan this code to verify your account</span>
            </div>
          </div>

          <div className="qr-account-summary">
            <div className="qr-account-summary-item">
              <span className="qr-summary-label">
                Student Name
              </span>

              <strong>{accountName}</strong>
            </div>

            <div className="qr-account-summary-item">
              <span className="qr-summary-label">
                Student ID
              </span>

              <strong>{studentId}</strong>
            </div>

            <div className="qr-account-summary-item">
              <span className="qr-summary-label">
                Account Status
              </span>

              <span className="qr-active-badge">
                <span className="qr-status-dot" />
                {qrStatus}
              </span>
            </div>
          </div>

          <div className="qr-card-actions">
            <button
              type="button"
              className="qr-primary-btn"
              onClick={handleDownload}
              disabled={!qrData}
            >
              <FaDownload />
              Download QR Code
            </button>
          </div>
        </div>

        <aside className="qr-card qr-security-card">
          <div className="qr-security-icon">
            <FaShieldAlt />
          </div>

          <span className="qr-card-eyebrow">
            ACCOUNT SECURITY
          </span>

          <h2>Keep Your QR Code Secure</h2>

          <p className="qr-security-intro">
            This QR code is linked to your student account.
            Only use it for official CTHM stockroom
            transactions.
          </p>

          <div className="qr-security-list">
            <div className="qr-security-item">
              <div className="qr-security-item-icon">
                <FaIdCard />
              </div>

              <div>
                <strong>Personal Identification</strong>
                <span>
                  Your QR code identifies your student
                  account during verification.
                </span>
              </div>
            </div>

            <div className="qr-security-item">
              <div className="qr-security-item-icon">
                <FaLock />
              </div>

              <div>
                <strong>Do Not Share</strong>
                <span>
                  Avoid sending your QR code to people who
                  are not authorized to verify your account.
                </span>
              </div>
            </div>

            <div className="qr-security-item">
              <div className="qr-security-item-icon">
                <FaShieldAlt />
              </div>

              <div>
                <strong>Official Use Only</strong>
                <span>
                  Use the QR code only through the CTHM
                  stockroom system.
                </span>
              </div>
            </div>
          </div>

          <div className="qr-security-note">
            <FaLock />

            <span>
              Your QR code contains a secure verification
              token rather than your password.
            </span>
          </div>
        </aside>
      </section>
    </main>
  );
}