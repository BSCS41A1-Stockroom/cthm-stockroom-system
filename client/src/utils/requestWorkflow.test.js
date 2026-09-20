import test from "node:test";
import assert from "node:assert/strict";
import { isInRoleQueue, requestStage, stageLabel } from "./requestWorkflow.js";

test("classifies every borrowing workflow stage consistently", () => {
  assert.equal(stageLabel({ status: "Pending" }), "Waiting for Professor");
  assert.equal(stageLabel({ status: "Validated" }), "Waiting for Staff");
  assert.equal(stageLabel({ status: "Validated", custodianVerifiedAt: "2026-09-20" }), "Waiting for Department Head");
  assert.equal(stageLabel({ status: "Approved" }), "Ready for Claim");
  assert.equal(requestStage({ status: "Returned" }), "returned");
});

test("places requests only in the corresponding role queue", () => {
  const professorRequest = { status: "Pending" };
  const staffRequest = { status: "Validated" };
  const headRequest = { status: "Validated", custodianVerifiedAt: "2026-09-20" };
  assert.equal(isInRoleQueue(professorRequest, "professor"), true);
  assert.equal(isInRoleQueue(professorRequest, "staff"), false);
  assert.equal(isInRoleQueue(staffRequest, "staff"), true);
  assert.equal(isInRoleQueue(staffRequest, "department_head"), false);
  assert.equal(isInRoleQueue(headRequest, "department_head"), true);
  assert.equal(isInRoleQueue(headRequest, "staff"), false);
  assert.equal(isInRoleQueue({ status: "Approved" }, "staff"), true);
});
