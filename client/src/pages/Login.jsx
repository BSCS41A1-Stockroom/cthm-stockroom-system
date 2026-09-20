import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/useAuth";
import { canResumeDestination, getRoleDestination } from "../auth/roleRouting";
import "./Login.css";

export default function Login() {
    const { user, profile, loading } = useAuth();
    const location = useLocation();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState("");

    const queryDestination = new URLSearchParams(
        location.search
    ).get("next");

    const sessionExpired =
        new URLSearchParams(location.search).get("reason") ===
        "session-expired";

    // =========================================================
    // SAFE DESTINATION
    // =========================================================

    const safeDestination = (value) => {
        if (
            typeof value === "string" &&
            value.startsWith("/") &&
            !value.startsWith("//")
        ) {
            return value;
        }

        return null;
    };

    // =========================================================
    // REDIRECT ALREADY AUTHENTICATED USER
    // =========================================================

    if (!loading && user && profile) {
        const roleDestination = getRoleDestination(profile.role);

        const requestedDestination =
            safeDestination(location.state?.from) ||
            safeDestination(queryDestination);

        /*
         * IMPORTANT:
         *
         * Do not allow a destination from another role.
         *
         * Example:
         * Professor logs in but previous URL was /admin.
         * We ignore /admin and send professor to /professor.
         */

        if (!roleDestination) {
            return <div className="auth-state auth-error">Your account role is not supported. Contact an administrator.</div>;
        }

        const destination = canResumeDestination(profile.role, requestedDestination)
            ? requestedDestination
            : roleDestination;

        return (
            <Navigate
                to={destination}
                replace
            />
        );
    }

    // =========================================================
    // PASSWORD LOGIN
    // =========================================================

    async function handleSubmit(event) {
        event.preventDefault();

        setError("");
        setSubmitting("password");

        const { error: signInError } =
            await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            });

        if (signInError) {
            setError(signInError.message);
            setSubmitting("");
            return;
        }

        /*
         * Do not manually navigate here.
         *
         * useAuth() will update after Supabase login,
         * then the redirect logic above will determine
         * the correct portal based on profile.role.
         */

        setSubmitting("");
    }

    // =========================================================
    // MICROSOFT LOGIN
    // =========================================================

    async function handleMicrosoftSignIn() {
        setError("");
        setSubmitting("microsoft");

        const destination =
            safeDestination(location.state?.from) ||
            safeDestination(queryDestination);

        const callback = new URL(
            "/login",
            window.location.origin
        );

        if (destination) {
            callback.searchParams.set(
                "next",
                destination
            );
        }

        const { error: signInError } =
            await supabase.auth.signInWithOAuth({
                provider: "azure",
                options: {
                    scopes: "email",
                    redirectTo: callback.toString(),
                },
            });

        if (signInError) {
            setError(signInError.message);
            setSubmitting("");
        }
    }

    // =========================================================
    // UI
    // =========================================================

    return (
        <main className="login-page">
            <form
                className="login-card"
                onSubmit={handleSubmit}
            >
                <div className="login-brand">
                    CTHM Stockroom
                </div>

                <h1>Welcome back</h1>

                <p>
                    Sign in with your school Microsoft account
                    or assigned system account.
                </p>

                {/* MICROSOFT LOGIN */}

                <button
                    className="microsoft-signin"
                    type="button"
                    disabled={Boolean(submitting)}
                    onClick={handleMicrosoftSignIn}
                >
                    <span
                        className="microsoft-mark"
                        aria-hidden="true"
                    >
                        <i />
                        <i />
                        <i />
                        <i />
                    </span>

                    {submitting === "microsoft"
                        ? "Connecting to Microsoft..."
                        : "Sign in with Microsoft"}
                </button>

                <div className="login-divider">
                    <span>
                        or use your assigned account
                    </span>
                </div>

                {/* EMAIL */}

                <label htmlFor="email">
                    Email address
                </label>

                <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) =>
                        setEmail(event.target.value)
                    }
                />

                {/* PASSWORD */}

                <label htmlFor="password">
                    Password
                </label>

                <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) =>
                        setPassword(event.target.value)
                    }
                />

                {/* ERROR */}

                {(error || sessionExpired) && (
                    <div
                        className="login-error"
                        role="alert"
                    >
                        {error ||
                            "Your session expired and was signed out securely. Please sign in again."}
                    </div>
                )}

                {/* SUBMIT */}

                <button
                    type="submit"
                    disabled={Boolean(submitting)}
                >
                    {submitting === "password"
                        ? "Signing in..."
                        : "Sign in"}
                </button>
            </form>
        </main>
    );
}
