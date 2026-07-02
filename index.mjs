// optin-token — dependency-free double-opt-in + one-click-unsubscribe primitives for the edge.
// See ./token.mjs (signed confirmation tokens) and ./unsub.mjs (List-Unsubscribe headers).
export { signToken, verifyToken } from "./token.mjs";
export { replyAddr, listUnsubscribe, oneClickHeaders } from "./unsub.mjs";
