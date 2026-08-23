"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { bearerToken, createAuthenticate, requireRoles } = require("./auth");

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("parses bearer access tokens strictly", () => {
  assert.equal(bearerToken("Bearer token-value"), "token-value");
  assert.equal(bearerToken("Basic token-value"), null);
  assert.equal(bearerToken(undefined), null);
});

test("rejects requests without an access token", async () => {
  const authenticate = createAuthenticate({});
  const response = responseRecorder();
  await authenticate({ headers: {} }, response, () => assert.fail("next should not run"));
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, "AUTHENTICATION_REQUIRED");
});

test("loads the trusted database role for a verified Supabase user", async () => {
  const authenticate = createAuthenticate({
    client: { auth: { async getUser() { return { data: { user: { id: "user-1", email: "student@example.com" } }, error: null }; } } },
    databasePool: {
      async query(_sql, params) {
        assert.deepEqual(params, ["user-1"]);
        return { rowCount: 1, rows: [{ user_id: "user-1", role: "student", full_name: "Student One", student_id: "2026-001" }] };
      },
    },
  });
  const request = { headers: { authorization: "Bearer valid-token" } };
  let nextCalled = false;
  await authenticate(request, responseRecorder(), () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(request.user.role, "student");
  assert.equal(request.user.student_id, "2026-001");
});

test("does not accept a role from the request or token metadata", async () => {
  const authenticate = createAuthenticate({
    client: { auth: { async getUser() { return { data: { user: { id: "user-2", user_metadata: { role: "admin" } } }, error: null }; } } },
    databasePool: {
      async query() { return { rowCount: 1, rows: [{ user_id: "user-2", role: "student", full_name: "Student", student_id: "S-2" }] }; },
    },
  });
  const request = { headers: { authorization: "Bearer valid-token" }, body: { role: "admin" } };
  await authenticate(request, responseRecorder(), () => {});
  assert.equal(request.user.role, "student");
});

test("role middleware permits only explicitly allowed roles", () => {
  const forbidden = responseRecorder();
  requireRoles("admin")({ user: { role: "student" } }, forbidden, () => assert.fail("next should not run"));
  assert.equal(forbidden.statusCode, 403);

  let allowed = false;
  requireRoles("professor", "admin")({ user: { role: "professor" } }, responseRecorder(), () => { allowed = true; });
  assert.equal(allowed, true);
});
