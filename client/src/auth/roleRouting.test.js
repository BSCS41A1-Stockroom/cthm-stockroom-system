import test from "node:test";
import assert from "node:assert/strict";
import { canResumeDestination, getRoleDestination } from "./roleRouting.js";

test("routes department staff to the shared stockroom portal", () => {
  assert.equal(getRoleDestination("staff"), "/admin");
  assert.equal(canResumeDestination("staff", "/admin/requests"), true);
  assert.equal(canResumeDestination("staff", "/professor"), false);
});

test("keeps every supported role inside its own portal", () => {
  assert.equal(getRoleDestination("student"), "/");
  assert.equal(getRoleDestination("professor"), "/professor");
  assert.equal(getRoleDestination("admin"), "/admin");
  assert.equal(getRoleDestination("department_head"), "/admin/requests");
  assert.equal(canResumeDestination("department_head", "/admin/requests"), true);
  assert.equal(getRoleDestination("unknown"), null);
});
