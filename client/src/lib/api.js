import { supabase } from "./supabase";

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

export const API_URL = (configuredApiUrl || "http://localhost:5000").replace(/\/+$/, "");

let refreshPromise = null;

function isRetryableAuthError(error) {
  const status = Number(error?.status ?? 0);
  return status === 0
    || status >= 500
    || error?.name === "AuthRetryableFetchError"
    || /fetch|network|timeout|temporar|unavailable/i.test(String(error?.message ?? ""));
}

function isDefinitiveSessionError(error) {
  const code = String(error?.code ?? "").toLowerCase();
  const message = String(error?.message ?? "").toLowerCase();
  return ["refresh_token_not_found", "invalid_refresh_token", "bad_jwt"].includes(code)
    || /refresh token.*(invalid|expired|not found)|invalid refresh token|already used/.test(message);
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      let result = await supabase.auth.refreshSession();
      if (result.error && isRetryableAuthError(result.error)) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 350));
        result = await supabase.auth.refreshSession();
      }
      return result;
    })().finally(() => { refreshPromise = null; });
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

function isSafeRead(options) {
  return String(options?.method ?? "GET").toUpperCase() === "GET";
}

async function requestWithTransientRetry(path, options, token) {
  try {
    const response = await requestWithToken(path, options, token);
    if (!isSafeRead(options) || ![502, 503, 504].includes(response.status)) return response;
  } catch (error) {
    if (!isSafeRead(options) || error?.name === "AbortError") throw error;
  }

  await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
  return requestWithToken(path, options, token);
}

export async function authenticatedFetch(path, options = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    if (isDefinitiveSessionError(error)) {
      await endExpiredSession(); throw new Error("Your session expired. Please sign in again.");
    }
    throw new Error("Unable to verify your session right now. Check your connection and try again.");
  }
  let session = data?.session;
  if (!session?.refresh_token) { await endExpiredSession(); throw new Error("Your session expired. Please sign in again."); }

  const expiresSoon = Number(session.expires_at ?? 0) * 1000 <= Date.now() + 30_000;
  if (expiresSoon) {
    const refreshed = await refreshSession();
    if (refreshed.error) {
      if (isDefinitiveSessionError(refreshed.error)) {
        await endExpiredSession(); throw new Error("Your session expired. Please sign in again.");
      }
      throw new Error("Your session could not be refreshed right now. Check your connection and try again.");
    }
    session = refreshed.data.session;
  }

  let response = await requestWithTransientRetry(path, options, session.access_token);
  if (response.status !== 401) return response;

  const refreshed = await refreshSession();
  if (refreshed.error || !refreshed.data.session?.access_token) {
    if (isDefinitiveSessionError(refreshed.error)) {
      await endExpiredSession(); throw new Error("Your session expired. Please sign in again.");
    }
    throw new Error("Your session could not be refreshed right now. Check your connection and try again.");
  }
  response = await requestWithTransientRetry(path, options, refreshed.data.session.access_token);
  if (response.status === 401) {
    throw new Error("The server could not verify your session. Please retry. If this continues, sign in again.");
  }
  return response;
}
