"use strict";
const test = require("node:test"); const assert = require("node:assert/strict");
const { normalizeUser, userErrors } = require("./userController");
test("normalizes managed users and enforces role-specific identity", () => {
  const student = normalizeUser({ email: " STUDENT@EXAMPLE.COM ", full_name: " Student One ", role: "student", student_id: " 2026-1 " });
  assert.equal(student.email, "student@example.com"); assert.deepEqual(userErrors(student, true), []);
  assert.equal(userErrors(normalizeUser({ fullName: "Professor", role: "professor" })).length, 0);
  assert.equal(userErrors(normalizeUser({ fullName: "Student", role: "student" })).some((error) => error.includes("student ID")), true);
});
