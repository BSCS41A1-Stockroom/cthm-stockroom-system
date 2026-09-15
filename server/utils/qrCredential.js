"use strict";

const crypto = require("crypto");

function signingSecret() {
  const secret = String(process.env.QR_SIGNING_SECRET ?? "");
  if (Buffer.byteLength(secret) < 32) {
    const error = new Error("QR_SIGNING_SECRET must contain at least 32 characters.");
    error.code = "QR_NOT_CONFIGURED";
    throw error;
  }
  return secret;
}

function signature(value) {
  return crypto.createHmac("sha256", signingSecret()).update(value).digest("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createAccountQr(publicId, version) {
  const payload = `cthmqr.v1.${publicId}.${version}`;
  return `${payload}.${signature(payload)}`;
}

function parseAccountQr(token) {
  const match = /^cthmqr\.v1\.([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([1-9]\d*)\.([A-Za-z0-9_-]{43})$/i.exec(String(token ?? "").trim());
  if (!match) return null;
  const payload = `cthmqr.v1.${match[1]}.${match[2]}`;
  return safeEqual(match[3], signature(payload))
    ? { publicId: match[1], version: Number(match[2]) }
    : null;
}

function createAssetQr(publicId, version) {
  const payload = `cthmasset.v1.${publicId}.${version}`;
  return `${payload}.${signature(payload)}`;
}

function parseAssetQr(token) {
  const match = /^cthmasset\.v1\.([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([1-9]\d*)\.([A-Za-z0-9_-]{43})$/i.exec(String(token ?? "").trim());
  if (!match) return null;
  const payload = `cthmasset.v1.${match[1]}.${match[2]}`;
  return safeEqual(match[3], signature(payload))
    ? { publicId: match[1], version: Number(match[2]) }
    : null;
}

function createClaimTicket({ requestId, userId, staffId, qrVersion, expiresAt }) {
  const payload = `claim.v1.${requestId}.${userId}.${staffId}.${qrVersion}.${expiresAt}`;
  return `${payload}.${signature(payload)}`;
}

function verifyClaimTicket(token, { requestId, staffId, now = Date.now() }) {
  const match = /^claim\.v1\.([1-9]\d*)\.([0-9a-f-]{36})\.([0-9a-f-]{36})\.([1-9]\d*)\.(\d+)\.([A-Za-z0-9_-]{43})$/i.exec(String(token ?? "").trim());
  if (!match) return null;
  const payload = `claim.v1.${match[1]}.${match[2]}.${match[3]}.${match[4]}.${match[5]}`;
  if (!safeEqual(match[6], signature(payload))) return null;
  if (String(match[1]) !== String(requestId) || match[3] !== staffId || Number(match[5]) < now) return null;
  return { requestId: Number(match[1]), userId: match[2], staffId: match[3], qrVersion: Number(match[4]), expiresAt: Number(match[5]) };
}

module.exports = { createAccountQr, createAssetQr, createClaimTicket, parseAccountQr, parseAssetQr, verifyClaimTicket };
