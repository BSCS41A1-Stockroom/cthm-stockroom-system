export function pairedTransactionReady(body) {
  if (!body || typeof body !== "object") return false;
  if (body.request && typeof body.request === "object") return true;
  return body.mode === "return" && Array.isArray(body.requests);
}
