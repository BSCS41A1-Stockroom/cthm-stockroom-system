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
    const [submitting, setSubmitting] = useState("");

    const queryDestination = new URLSearchParams(
        location.search
    ).get("next");

    const sessionExpired =
        new URLSearchParams(location.search).get("reason") ===
        "session-expired";

    const safeDestination = (value) => {
        return (
            typeof value === "string" &&
            value.startsWith("/") &&
            !value.startsWith("//")
        )
            ? value
            : null;
    };

    // =========================================================
    // ROLE-BASED DEFAULT DESTINATION
    // =========================================================

    const getRoleDestination = (role) => {
        switch (role) {
            case "student":
                return "/";

            case "professor":
                return "/professor";

            case "admin":
                return "/admin";

            default:
                return "/login";
        }
    };

    // =========================================================
    // REDIRECT ALREADY AUTHENTICATED USER
    // =========================================================

    if (!loading && user && profile) {
        const destination =
            safeDestination(location.state?.from) ||
            safeDestination(queryDestination) ||
            getRoleDestination(profile.role);

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
        }

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