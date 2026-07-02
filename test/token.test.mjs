import { test } from "node:test";
import assert from "node:assert/strict";
import { signToken, verifyToken } from "../token.mjs";

const SECRET = "test-secret-key-do-not-use-in-prod";
const T0 = 1_700_000_000_000; // fixed ms, so tests are deterministic

test("a freshly signed token verifies and round-trips its payload", async () => {
  const tok = await signToken(SECRET, { email: "a@b.com", lens: "money" }, { ttlSeconds: 86400, now: T0 });
  const res = await verifyToken(SECRET, tok, { now: T0 + 1000 });
  assert.equal(res.valid, true);
  assert.equal(res.payload.email, "a@b.com");
  assert.equal(res.payload.lens, "money");
  assert.equal(res.payload.iat, Math.floor(T0 / 1000));
  assert.equal(res.payload.exp, Math.floor(T0 / 1000) + 86400);
});

test("a token signed with another secret is rejected (forgery)", async () => {
  const tok = await signToken(SECRET, { email: "a@b.com" }, { ttlSeconds: 60, now: T0 });
  const res = await verifyToken("a-different-secret", tok, { now: T0 });
  assert.equal(res.valid, false);
  assert.equal(res.reason, "bad-signature");
});

test("a tampered signature is rejected", async () => {
  const tok = await signToken(SECRET, { email: "a@b.com" }, { ttlSeconds: 60, now: T0 });
  const [p, s] = tok.split(".");
  const flipped = s.slice(0, -1) + (s.slice(-1) === "A" ? "B" : "A");
  const res = await verifyToken(SECRET, p + "." + flipped, { now: T0 });
  assert.equal(res.valid, false);
});

test("a tampered payload is rejected (signature no longer matches)", async () => {
  const tok = await signToken(SECRET, { role: "user" }, { ttlSeconds: 60, now: T0 });
  const [, s] = tok.split(".");
  const forgedPayload = btoa(JSON.stringify({ role: "admin", exp: Math.floor(T0 / 1000) + 60 }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const res = await verifyToken(SECRET, forgedPayload + "." + s, { now: T0 });
  assert.equal(res.valid, false);
  assert.equal(res.reason, "bad-signature");
});

test("an expired token is rejected, but its payload is still returned", async () => {
  const tok = await signToken(SECRET, { email: "a@b.com" }, { ttlSeconds: 60, now: T0 });
  const res = await verifyToken(SECRET, tok, { now: T0 + 61_000 });
  assert.equal(res.valid, false);
  assert.equal(res.reason, "expired");
  assert.equal(res.payload.email, "a@b.com"); // available for a friendly "link expired" message
});

test("malformed tokens are rejected, never thrown", async () => {
  for (const bad of ["", "nodot", "...", "x.", ".y", "a@b.c", null, undefined, 42, {}]) {
    const res = await verifyToken(SECRET, bad, { now: T0 });
    assert.equal(res.valid, false, `expected invalid for ${JSON.stringify(bad)}`);
  }
});

test("now defaults to real time (a just-signed short token is still valid)", async () => {
  const tok = await signToken(SECRET, { x: 1 }, { ttlSeconds: 60 });
  const res = await verifyToken(SECRET, tok);
  assert.equal(res.valid, true);
});
