// HMAC opt-in / confirmation tokens — for double-opt-in email confirmation, one-click
// unsubscribe links, magic links, and any "prove WE issued this, and it hasn't expired" URL.
//
// Runtime-agnostic: uses Web Crypto (globalThis.crypto.subtle), present in the Cloudflare
// Workers runtime, Deno, Bun, browsers, and Node 20+. No Buffer / no `node:` imports, so it
// bundles for Cloudflare Workers with NO nodejs_compat flag.
//
// Token format:  base64url(JSON payload) "." base64url(HMAC-SHA256 of that JSON)
// The payload carries your intent plus iat/exp. The signature proves the holder of `secret`
// issued it (it can't be forged or guessed); exp bounds its lifetime.
//
// SINGLE-USE is intentionally NOT enforced here — a stateless token can't know it's been
// spent. Enforce single-use at your storage layer (e.g. a confirmed/removed record can't be
// re-confirmed), and keep exp short. This library owns authenticity + expiry, nothing else.

const subtle = () => globalThis.crypto.subtle; // lazy: avoid import-time crash on old runtimes
const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToB64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBytes(str) {
  const pad = str.length % 4 === 0 ? 0 : 4 - (str.length % 4);
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function keyFor(secret) {
  return subtle().importKey("raw", enc.encode(String(secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

// Sign `payload` (plus iat/exp) into a token. `ttlSeconds` bounds its lifetime.
// `now` (ms) is injectable so callers can produce deterministic tokens in tests.
export async function signToken(secret, payload, { ttlSeconds, now = Date.now() }) {
  const nowS = Math.floor(now / 1000);
  const body = { ...payload, iat: nowS, exp: nowS + ttlSeconds };
  const json = JSON.stringify(body);
  const sig = new Uint8Array(await subtle().sign("HMAC", await keyFor(secret), enc.encode(json)));
  return bytesToB64url(enc.encode(json)) + "." + bytesToB64url(sig);
}

// Verify a token. Returns { valid, payload?, reason? }. Never throws on bad input.
// `reason` is one of "malformed" | "bad-signature" | "expired". On "expired" the decoded
// (but no-longer-valid) payload is still returned, so callers can render a friendly message.
export async function verifyToken(secret, token, { now = Date.now() } = {}) {
  if (typeof token !== "string" || token.indexOf(".") < 1 || token.endsWith(".")) {
    return { valid: false, reason: "malformed" };
  }
  const [p, s] = token.split(".");
  let jsonBytes, sigBytes;
  try {
    jsonBytes = b64urlToBytes(p);
    sigBytes = b64urlToBytes(s);
  } catch {
    return { valid: false, reason: "malformed" };
  }
  let ok = false;
  try {
    ok = await subtle().verify("HMAC", await keyFor(secret), sigBytes, jsonBytes);
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (!ok) return { valid: false, reason: "bad-signature" };
  let payload;
  try {
    payload = JSON.parse(dec.decode(jsonBytes));
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (typeof payload.exp !== "number" || Math.floor(now / 1000) > payload.exp) {
    return { valid: false, reason: "expired", payload };
  }
  return { valid: true, payload };
}
