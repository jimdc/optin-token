# optin-token

**Double-opt-in confirmation tokens + one-click (RFC 8058) unsubscribe headers, with zero dependencies.** Web Crypto only — so it runs on **Cloudflare Workers with no `nodejs_compat`**, and equally on Deno, Bun, browsers, and Node 20+.

If you're building a newsletter, an alerts service, or any transactional email flow and you need to (a) issue a signed "click to confirm" link you can trust when it comes back, and (b) add the `List-Unsubscribe` headers that make Gmail/Apple Mail show a one-tap unsubscribe — this is the ~120 lines you'd otherwise write by hand and get subtly wrong. No JWT library, no `Buffer`, no `crypto` node import.

```
npm install optin-token
```

## Quickstart

```js
import { signToken, verifyToken, oneClickHeaders } from "optin-token";

// 1. Someone submits your subscribe form. Store NOTHING yet — just email them a signed link.
const token = await signToken(SECRET, { email, list: "weekly" }, { ttlSeconds: 86_400 });
const confirmUrl = `https://you.example/confirm?token=${encodeURIComponent(token)}`;
// …send confirmUrl in a "please confirm your subscription" email…

// 2. They click it. Now — and only now — is it a real, verified opt-in.
const res = await verifyToken(SECRET, token);
if (res.valid) {
  await subscribers.put(res.payload.email, res.payload.list); // safe to persist
} else if (res.reason === "expired") {
  // res.payload is still there, so you can say "that link expired, subscribe again"
}

// 3. Every email you then send carries a real one-click unsubscribe:
const headers = oneClickHeaders(`https://you.example/unsub?token=${await signToken(SECRET, { email }, { ttlSeconds: 31_536_000 })}`);
// { "List-Unsubscribe": "<https://…>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
```

## Why double opt-in needs a *token* (and not a database row)

The point of double opt-in is that you persist nothing until the person proves they own the address — so a stranger can't sign up someone else, and you never store an unconfirmed address. That means the confirmation link has to carry the intent *and* be tamper-proof, because there's no server-side record to check it against yet.

A signed token does exactly that: the payload is your `{ email, list, … }`, and the HMAC signature proves **you** issued it (nobody can forge or guess a valid link), while `exp` bounds how long it's good for. You store the subscriber only after a valid token comes back. Single-use is enforced by *your* storage (a confirmed record can't be re-confirmed) plus a short TTL — a stateless token can't know it's been spent, and this library is honest about owning only authenticity + expiry.

## API

### `signToken(secret, payload, { ttlSeconds, now? }) → Promise<string>`
HMAC-SHA256-signs `{ ...payload, iat, exp }` and returns `base64url(json).base64url(sig)`. `now` (ms) is injectable for deterministic tests.

### `verifyToken(secret, token, { now? }) → Promise<{ valid, payload?, reason? }>`
Never throws. `reason` is `"malformed" | "bad-signature" | "expired"`. On `"expired"` the decoded payload is still returned so you can render a friendly message.

### `listUnsubscribe(from, listId) → string`
A `mailto:` `List-Unsubscribe` value (`<mailto:you@x?subject=unsubscribe%20listId>`). Needs no HTTPS endpoint — unsubscribe requests land in an inbox you read. Good for small/manual lists.

### `oneClickHeaders(url, { mailtoFallback? }) → { "List-Unsubscribe", "List-Unsubscribe-Post" }`
The **RFC 8058** header pair for true one-tap unsubscribe: mail clients POST to `url` with no confirmation page. Spread it into your outbound message headers. Your endpoint should verify a signed token in `url` (see quickstart) and remove the subscriber.

## Runs where JWT libraries don't

Tokens here are the same shape a minimal JWT would be, but the implementation uses only `crypto.subtle`, `TextEncoder`, and `btoa`/`atob` — all Web-standard globals. There is no `Buffer`, no `node:crypto`, no polyfill. So it bundles cleanly for a **Cloudflare Worker without the `nodejs_compat` flag** (where many JWT/HMAC libraries fail), and the identical code runs under your Node test runner.

## Prior art — and why this exists

I went looking before publishing (2026) and found nothing that packages *double-opt-in + RFC 8058 one-click-unsubscribe* as a standalone, storage-agnostic, Web-Crypto-only library:

- **`jose`** (~88M downloads/wk) is the gold standard for JWS/JWT signing — but it's the *signing primitive only*. It has no notion of opt-in intent, confirmation flows, or List-Unsubscribe headers. You'd build all of that on top. `optin-token` *is* that thin layer, minus the JWT surface area you don't need.
- **Full ESP SDKs** (Mailchimp, ConvertKit, Resend helpers, `@growth-labs/mailer`, …) implement double opt-in, but bury it inside a framework/engine with a storage coupling (Drizzle/D1, a specific provider). You can't import just the token logic. Notably, one of them converged on the *identical* `base64url(payload).base64url(hmac)` design independently — which is reassuring about the design, not a reason it's reusable.
- **`email-verification` / one-off gists** tend to assume Node `crypto`/`Buffer` and won't bundle for the edge, or they store a random token in a DB (which is fine, but then you've persisted an unconfirmed address — the thing double opt-in exists to avoid).

If you found this by searching for *"double opt-in token cloudflare workers"*, *"RFC 8058 one-click unsubscribe node"*, *"List-Unsubscribe-Post header library"*, *"HMAC confirmation link web crypto"*, or *"opt-in token without nodejs_compat"* — yes, this is the thing, and the whole surface is the API above.

**Honest scope:** the defensible core is small (signed token + two header builders). The value is the *packaged semantics* (opt-in lifecycle, RFC 8058) and the test suite, not novel crypto. If you already depend on `jose` and just need the primitive, use `jose`.

## Provenance

Extracted from the production backend of [CROL-List](https://crol-list.org) (a civic-data alerts service on Cloudflare Workers), where it issues every subscription-confirm and unsubscribe link. Battle-tested on the exact "small serverless email service" case it's designed for.

## License

MIT © James Carroll
