import { supabase } from "./supabase";

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

export const API_URL = (configuredApiUrl || "http://localhost:5000").replace(/\/+$/, "");

let refreshPromise = null;

function isRetryableAuthError(error) {
  return error?.status === 0 || error?.name === "AuthRetryableFetchError" || /fetch|network/i.test(String(error?.message ?? ""));
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = supabase.auth.refreshSession().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function endExpiredSession() {
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    const destination = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const login = new URL("/login", window.location.origin);
    login.searchParams.set("reason", "session-expired");
    login.searchParams.set("next", destination);
    window.location.replace(login.toString());
  }
}

function requestWithToken(path, options, token) {
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
}

export async function authenticatedFetch(path, options = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error && isRetryableAuthError(error)) throw new Error("Unable to verify your session. Check your internet connection and try again.");
  let session = data.session;
  if (!session?.refresh_token) { await endExpiredSession(); throw new Error("Your session expired. Please sign in again."); }

  const expiresSoon = Number(session.expires_at ?? 0) * 1000 <= Date.now() + 30_000;
  if (expiresSoon) {
    const refreshed = await refreshSession();
    if (refreshed.error) {
      if (isRetryableAuthError(refreshed.error)) throw new Error("Unable to refresh your session. Check your internet connection and try again.");
      await endExpiredSession(); throw new Error("Your session expired. Please sign in again.");
    }
    session = refreshed.data.session;
  }

  let response = await requestWithToken(path, options, session.access_token);
  if (response.status !== 401) return response;

  const refreshed = await refreshSession();
  if (refreshed.error || !refreshed.data.session?.access_token) {
    if (isRetryableAuthError(refreshed.error)) throw new Error("Unable to refresh your session. Check your internet connection and try again.");
    await endExpiredSession(); throw new Error("Your session expired. Please sign in again.");
  }
  response = await requestWithToken(path, options, refreshed.data.session.access_token);
  if (response.status === 401) {
    await endExpiredSession();
    throw new Error("Your session expired. Please sign in again.");
  }
  return response;
}
