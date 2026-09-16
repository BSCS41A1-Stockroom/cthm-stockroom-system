"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeResolution, resolutionErrors } = require("./accountabilityController");

test("accepts documented non-financial accountability resolutions", () => {
  const input = normalizeResolution({ status:"resolved",resolutionType:"recovered",resolutionNote:"The missing item was returned and inspected." });
  assert.deepEqual(resolutionErrors(input), []);
});

test("requires explicit confirmation before recording a payment", () => {
  const unconfirmed = normalizeResolution({ status:"resolved",resolutionType:"payment_recorded",resolutionNote:"Receipt checked by the administrator.",amount:"500" });
  assert.ok(resolutionErrors(unconfirmed).some((message) => message.includes("Confirm")));
  const confirmed = normalizeResolution({ status:"resolved",resolutionType:"payment_recorded",resolutionNote:"Receipt checked by the administrator.",amount:"500",confirmPayment:true });
  assert.deepEqual(resolutionErrors(confirmed), []);
});

test("requires waived status and resolution to agree", () => {
  const input = normalizeResolution({ status:"resolved",resolutionType:"waived",resolutionNote:"Waived after documented administrative review." });
  assert.ok(resolutionErrors(input).some((message) => message.includes("Waived")));
});
