// List-Unsubscribe header builders — the opt-OUT half of the opt-in lifecycle.
//
// Two forms, both pure (no I/O), so they're trivially testable and edge-safe:
//   • mailto form  — an angle-bracketed `mailto:` whose subject names the list. No HTTPS
//                    endpoint required: the unsubscribe request lands in an inbox you read.
//                    Good for a small/manually-managed list.
//   • one-click    — RFC 8058 `List-Unsubscribe` + `List-Unsubscribe-Post` header pair, so
//                    Gmail/Apple Mail show a one-tap "Unsubscribe" that POSTs to your URL with
//                    no confirmation page. Requires an HTTPS endpoint that removes the sub.
//
// Pair these with signToken()/verifyToken(): put a signed { list, id } token in the unsubscribe
// URL so your one-click endpoint can trust the request without a session.

// Extract the bare address from an RFC 5322 From ("Name <addr>" or a bare "addr").
export function replyAddr(from) {
  const m = String(from || "").match(/<([^>]+)>/);
  return (m ? m[1] : String(from || "")).trim();
}

// Build a mailto List-Unsubscribe header value: an angle-bracketed mailto whose subject names
// the list/segment, so a manual unsubscribe tells you which slice to drop.
//   listUnsubscribe("Acme <news@acme.com>", "weekly") -> "<mailto:news@acme.com?subject=unsubscribe%20weekly>"
export function listUnsubscribe(from, listId) {
  const subject = encodeURIComponent(`unsubscribe ${listId}`);
  return `<mailto:${replyAddr(from)}?subject=${subject}>`;
}

// Build the RFC 8058 one-click header pair for a per-recipient unsubscribe URL. Optionally
// append a mailto as a fallback for clients that don't do one-click. Returns a plain object you
// spread into your outbound message headers.
//   oneClickHeaders("https://api.acme.com/unsub?token=…")
//     -> { "List-Unsubscribe": "<https://…>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
export function oneClickHeaders(url, { mailtoFallback } = {}) {
  const parts = [`<${url}>`];
  if (mailtoFallback) parts.push(mailtoFallback.startsWith("<") ? mailtoFallback : `<${mailtoFallback}>`);
  return {
    "List-Unsubscribe": parts.join(", "),
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
