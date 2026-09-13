"use strict";
const test = require("node:test"); const assert = require("node:assert/strict");
const { invitationRedirectUrl, normalizeUser, userErrors } = require("./userController");

test("sends invitations to the password setup page", () => {
  assert.equal(invitationRedirectUrl("https://stockroom.example.com"), "https://stockroom.example.com/set-password");
  assert.equal(invitationRedirectUrl("http://localhost:5173"), "http://localhost:5173/set-password");
});

test("does not send invitations to an unconfigured or insecure redirect", () => {
  assert.throws(() => invitationRedirectUrl(""), /CLIENT_URL is required/);
  assert.throws(() => invitationRedirectUrl("http://stockroom.example.com"), /HTTPS/);
});
test("normalizes managed users and enforces role-specific identity", () => {
  const student = normalizeUser({ email: " STUDENT@EXAMPLE.COM ", full_name: " Student One ", role: "student", student_id: " 2026-1 " });
  assert.equal(student.email, "student@example.com"); assert.deepEqual(userErrors(student, true), []);
  assert.equal(userErrors(normalizeUser({ fullName: "Professor", role: "professor" })).length, 0);
  assert.equal(userErrors(normalizeUser({ fullName: "Student", role: "student" })).some((error) => error.includes("student ID")), true);
});
