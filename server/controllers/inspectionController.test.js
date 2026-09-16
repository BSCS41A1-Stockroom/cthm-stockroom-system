"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectionErrors, intervalValue } = require("./inspectionController");

test("accepts valid preventive-inspection settings", () => {
  assert.equal(intervalValue(30), 30);
  assert.equal(intervalValue("3650"), 3650);
  assert.equal(intervalValue(""), null);
  assert.equal(intervalValue(null), null);
});

test("rejects unsafe preventive-inspection intervals", () => {
  assert.equal(Number.isNaN(intervalValue(0)), true);
  assert.equal(Number.isNaN(intervalValue(3651)), true);
  assert.equal(Number.isNaN(intervalValue("weekly")), true);
  assert.equal(Number.isNaN(intervalValue(2.5)), true);
});

test("requires a supported result and meaningful inspection notes", () => {
  assert.deepEqual(inspectionErrors({ result: "FAIR", notes: " Minor surface wear. " }), { result: "fair", notes: "Minor surface wear.", errors: [] });
  const invalid = inspectionErrors({ result: "unknown", notes: "bad" });
  assert.equal(invalid.errors.length, 2);
});
