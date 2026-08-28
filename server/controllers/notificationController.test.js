"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidNotificationId } = require("./notificationController");

test("accepts only positive numeric notification identifiers", () => {
  assert.equal(isValidNotificationId("12"), true);
  assert.equal(isValidNotificationId("12 OR 1=1"), false);
  assert.equal(isValidNotificationId("-1"), false);
  assert.equal(isValidNotificationId(""), false);
});
