import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { supabase } from "../lib/supabase";
import { PASSWORD_REQUIREMENTS, passwordErrors } from "../utils/passwordPolicy";
import { getRoleDestination } from "../auth/roleRouting";
import "./Login.css";

export default function SetPassword() {
  const { user, profile, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (loading) return <div className="auth-state">Verifying your invitation...</div>;
  if (saved) return <Navigate to={getRoleDestination(profile?.role) || "/login"} replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    const errors = passwordErrors(password);
    if (errors.length) {
      setError(`Password must have: ${errors.join(", ")}.`);
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSaved(true);
    } catch (updateError) {
      setError(updateError.message || "Unable to set your password. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-brand">CTHM Stockroom</div>
        <h1>Create your password</h1>
        {!user ? (
          <>
            <p>Your invitation link is missing, invalid, or expired. Open the latest invitation email, or ask an administrator to send a new one.</p>
            <Link to="/login">Back to sign in</Link>
          </>
        ) : (
          <form className="password-form" onSubmit={handleSubmit}>
            <p>Choose a password for {user.email}. Your administrator will never see it.</p>
            <label htmlFor="new-password">New password</label>
            <input id="new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={16}
              value={password} onChange={(event) => setPassword(event.target.value)} />
            <ul className="password-requirements">
              {PASSWORD_REQUIREMENTS.map((requirement) => (
                <li key={requirement.label} className={requirement.test(password) ? "met" : ""}>{requirement.label}</li>
              ))}
            </ul>
            <label htmlFor="confirm-password">Confirm password</label>
            <input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} maxLength={16}
              value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            {error && <div className="login-error" role="alert">{error}</div>}
            <button type="submit" disabled={saving}>{saving ? "Saving password..." : "Set password"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
