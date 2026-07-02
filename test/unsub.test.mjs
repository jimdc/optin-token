import { test } from "node:test";
import assert from "node:assert/strict";
import { replyAddr, listUnsubscribe, oneClickHeaders } from "../unsub.mjs";

test("replyAddr extracts the address from a display-name From", () => {
  assert.equal(replyAddr("Acme <news@acme.com>"), "news@acme.com");
});

test("replyAddr passes through a bare address", () => {
  assert.equal(replyAddr("news@acme.com"), "news@acme.com");
});

test("replyAddr tolerates empty/garbage input", () => {
  assert.equal(replyAddr(""), "");
  assert.equal(replyAddr(null), "");
  assert.equal(replyAddr(undefined), "");
});

test("listUnsubscribe builds an angle-bracketed mailto with an encoded subject", () => {
  assert.equal(
    listUnsubscribe("Acme <news@acme.com>", "awards-1m"),
    "<mailto:news@acme.com?subject=unsubscribe%20awards-1m>"
  );
});

test("listUnsubscribe encodes spaces in a list id", () => {
  assert.equal(
    listUnsubscribe("news@acme.com", "rivington watch"),
    "<mailto:news@acme.com?subject=unsubscribe%20rivington%20watch>"
  );
});

test("oneClickHeaders builds the RFC 8058 header pair", () => {
  assert.deepEqual(oneClickHeaders("https://api.acme.com/unsub?token=abc"), {
    "List-Unsubscribe": "<https://api.acme.com/unsub?token=abc>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
});

test("oneClickHeaders can append a mailto fallback (angle brackets added if missing)", () => {
  const h = oneClickHeaders("https://api.acme.com/unsub?token=abc", { mailtoFallback: "mailto:news@acme.com" });
  assert.equal(h["List-Unsubscribe"], "<https://api.acme.com/unsub?token=abc>, <mailto:news@acme.com>");
  const h2 = oneClickHeaders("https://x/y", { mailtoFallback: "<mailto:z@x>" });
  assert.equal(h2["List-Unsubscribe"], "<https://x/y>, <mailto:z@x>");
});
