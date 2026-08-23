import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/useAuth";
import "./Login.css";

export default function Login() {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user && profile) {
    const fallback = profile.role === "student" ? "/" : "/admin";
    return <Navigate to={location.state?.from || fallback} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) setError(signInError.message);
    setSubmitting(false);
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">CTHM Stockroom</div>
        <h1>Welcome back</h1>
        <p>Sign in with your assigned account to continue.</p>

        <label htmlFor="email">Email address</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />

        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />

        {error && <div className="login-error" role="alert">{error}</div>}
        <button type="submit" disabled={submitting}>{submitting ? "Signing in..." : "Sign in"}</button>
      </form>
    </main>
  );
}
