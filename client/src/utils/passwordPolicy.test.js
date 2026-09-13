import test from "node:test";
import assert from "node:assert/strict";
import { passwordErrors } from "./passwordPolicy.js";

test("accepts passwords meeting every requirement at both length boundaries", () => {
  assert.deepEqual(passwordErrors("Abcdef1!"), []);
  assert.deepEqual(passwordErrors("Abcdefghijklmn1!"), []);
});

test("rejects short, long, and incomplete passwords", () => {
  assert.ok(passwordErrors("Abc12!").includes("8 to 16 characters"));
  assert.ok(passwordErrors("Abcdefghijklmno1!").includes("8 to 16 characters"));
  assert.ok(passwordErrors("abcdef1!").includes("At least one uppercase letter"));
  assert.ok(passwordErrors("ABCDEF1!").includes("At least one lowercase letter"));
  assert.ok(passwordErrors("Abcdefg!").includes("At least one number"));
  assert.ok(passwordErrors("Abcdefg1").includes("At least one symbol"));
});
