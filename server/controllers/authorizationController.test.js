"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { decodeSignature } = require("./authorizationController");

test("accepts real image signatures and rejects disguised or oversized data", () => {
  const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  const parsed = decodeSignature(`data:image/png;base64,${png.toString("base64")}`);
  assert.equal(parsed.mimeType, "image/png");
  assert.equal(parsed.data.equals(png), true);
  assert.match(parsed.imageHash, /^[0-9a-f]{64}$/);
  assert.equal(decodeSignature(`data:image/jpeg;base64,${png.toString("base64")}`), null);
  assert.equal(decodeSignature("data:text/plain;base64,dGVzdA=="), null);
});
