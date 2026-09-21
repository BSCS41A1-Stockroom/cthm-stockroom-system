import { useState } from "react";
import { FaEnvelope, FaIdBadge, FaKey, FaShieldAlt } from "react-icons/fa";
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
  const hasSignature = ["student", "professor", "staff", "department_head"].includes(role);

  const sendPasswordReset = async () => {
    if (!user?.email || resetState.busy) return;
    setResetState({ busy: true, message: "", error: false });
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/set-password`,
    });
    setResetState(error
      ? { busy: false, message: error.message || "Unable to send the password reset email.", error: true }
      : { busy: false, message: "Password reset instructions were sent to your email.", error: false });
  };

  return <main className="profile-security-page">
    <header className="profile-security-header">
      <span>ACCOUNT SETTINGS</span>
      <h1>Profile &amp; Security</h1>
      <p>Manage your account identity, security, and role-specific credentials in one place.</p>
    </header>

    <section className="profile-overview-card">
      <div className="profile-overview-icon"><FaIdBadge /></div>
      <div className="profile-overview-heading"><h2>{profile?.full_name || "Account"}</h2><span>{ROLE_LABELS[role] || role}</span></div>
      <dl>
        <div><dt>Email</dt><dd>{user?.email || "Not available"}</dd></div>
        {profile?.student_id && <div><dt>Student ID</dt><dd>{profile.student_id}</dd></div>}
        <div><dt>Account status</dt><dd className="profile-active-status">Active</dd></div>
        {profile?.department_id && <div><dt>Department reference</dt><dd>{profile.department_id}</dd></div>}
      </dl>
    </section>

    <section className="profile-security-card">
      <div className="profile-security-card-icon"><FaKey /></div>
      <div><h2>Password &amp; Account Security</h2><p>We will send a secure password-reset link to your registered email address.</p>
        {resetState.message && <p className={resetState.error ? "profile-setting-error" : "profile-setting-success"} role="status">{resetState.message}</p>}
      </div>
      <button type="button" onClick={sendPasswordReset} disabled={resetState.busy || !user?.email}>
        <FaEnvelope /> {resetState.busy ? "Sending..." : "Send reset email"}
      </button>
    </section>

    {role === "student" && <section className="profile-tool-section"><AccountQr embedded /></section>}
    {hasSignature && <section className="profile-tool-section"><SignatureSettings embedded /></section>}
    {role === "admin" && <section className="profile-security-card profile-security-note"><div className="profile-security-card-icon"><FaShieldAlt /></div><div><h2>Administrator Security</h2><p>General administrators manage the system but are not transaction signatories. No personal signature is required for this role.</p></div></section>}
  </main>;
}
