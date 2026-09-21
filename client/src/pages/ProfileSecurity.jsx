import { useState } from "react";
import { FaCheckCircle, FaEnvelope, FaIdBadge, FaKey, FaQrcode, FaShieldAlt, FaSignature } from "react-icons/fa";
import { useAuth } from "../auth/useAuth";
import { supabase } from "../lib/supabase";
import AccountQr from "./student/AccountQr";
import SignatureSettings from "./admin/SignatureSettings";
import "../styles/profileSecurity.css";

const ROLE_LABELS = {
  student: "Student",
  professor: "Professor",
  staff: "Stockroom Staff",
  department_head: "Department Head",
  admin: "General Administrator",
};

export default function ProfileSecurity() {
  const { user, profile } = useAuth();
  const [resetState, setResetState] = useState({ busy: false, message: "", error: false });
  const role = profile?.role || "user";
  const hasSignature = ["student", "professor", "staff", "admin"].includes(role);

  const sendPasswordReset = async () => {
    if (!user?.email || resetState.busy) return;
    setResetState({ busy: true, message: "", error: false });
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/set-password`,
      });
      if (error) throw error;
      setResetState({ busy: false, message: "Password reset instructions were sent to your email.", error: false });
    } catch (error) {
      setResetState({ busy: false, message: error.message || "Unable to send the password reset email.", error: true });
    }
  };

  return <main className="profile-security-page">
    <header className="profile-security-header">
      <span>ACCOUNT SETTINGS</span>
      <h1>Profile &amp; Security</h1>
      <p>Review your account details and manage the credentials used for stockroom transactions.</p>
    </header>

    <section className="profile-overview-card" aria-labelledby="profile-overview-title">
      <div className="profile-overview-top">
        <div className="profile-overview-icon" aria-hidden="true"><FaIdBadge /></div>
        <div className="profile-overview-heading">
          <span className="profile-card-eyebrow">YOUR ACCOUNT</span>
          <h2 id="profile-overview-title">{profile?.full_name || "Account"}</h2>
          <span className="profile-role-badge">{ROLE_LABELS[role] || role}</span>
        </div>
        <span className="profile-active-badge"><FaCheckCircle aria-hidden="true" /> Active</span>
      </div>
      <dl className="profile-details">
        <div><dt>Email address</dt><dd>{user?.email || "Not available"}</dd></div>
        {profile?.student_id && <div><dt>Student ID</dt><dd>{profile.student_id}</dd></div>}
        {profile?.department_id && <div><dt>Department ID</dt><dd>{profile.department_id}</dd></div>}
      </dl>
    </section>

    <section className="profile-security-card" aria-labelledby="profile-password-title">
      <div className="profile-security-card-icon" aria-hidden="true"><FaKey /></div>
      <div className="profile-security-card-copy"><h2 id="profile-password-title">Password &amp; security</h2><p>Need to change your password? We&apos;ll send a reset link to your registered email address.</p>
        {resetState.message && <p className={resetState.error ? "profile-setting-error" : "profile-setting-success"} role="status">{resetState.message}</p>}
      </div>
      <button type="button" onClick={sendPasswordReset} disabled={resetState.busy || !user?.email}>
        <FaEnvelope aria-hidden="true" /> {resetState.busy ? "Sending..." : "Send reset email"}
      </button>
    </section>

    {role === "student" && <section className="profile-tool-section" aria-labelledby="profile-qr-title">
      <div className="profile-section-heading"><div className="profile-section-icon" aria-hidden="true"><FaQrcode /></div><div><h2 id="profile-qr-title">Account QR code</h2><p>Show this code when staff verify your account for a stockroom transaction.</p></div></div>
      <AccountQr />
    </section>}
    {hasSignature && <section className="profile-tool-section" aria-labelledby="profile-signature-title">
      <div className="profile-section-heading"><div className="profile-section-icon" aria-hidden="true"><FaSignature /></div><div><h2 id="profile-signature-title">Electronic signature</h2><p>Keep your personal signature ready for actions you explicitly authorize.</p></div></div>
      <SignatureSettings />
    </section>}
    {role === "admin" && <section className="profile-security-card profile-security-note"><div className="profile-security-card-icon" aria-hidden="true"><FaShieldAlt /></div><div className="profile-security-card-copy"><h2>Custodian Head authority</h2><p>Your Admin account provides system-wide access and final Custodian Head approval. Every approval records your identity, signature snapshot, and timestamp.</p></div></section>}
  </main>;
}
