#!/usr/bin/env node
/**
 * Pins request signing against LOOP's own worked example.
 *
 *   npm run verify:signing
 *
 * The vector below is the one published in the sandbox portal's Transaction
 * History documentation, alongside the shared sandbox test tills — the same
 * way a crypto library ships RFC test vectors. If this drifts, every signed
 * call to LOOP fails with a signature error, so it's worth a second to check.
 */
import crypto from "node:crypto";

const VECTOR = {
  secret: "hyqd7bwMr9Kv-C5PW4n7uF4TiMnMp_hyvyhYYkYlcU8",
  merchantTill: "133239",
  timestamp: "2026-07-21T08:47:12Z",
  nonce: "c2a91b7e-4d05-4f8a-a3c6-9e1f5d7b2a48",
  expected: "8b48798149f4f71095dabbeea88c116730fb56f18c90970b39d992442f9561c9",
};

/** Mirrors signRequest() in lib/loop/auth.ts. */
function signRequest(merchantTill, timestamp, nonce, tillSecret) {
  return crypto
    .createHmac("sha256", tillSecret)
    .update(`${merchantTill}|${timestamp}|${nonce}`, "utf8")
    .digest("hex");
}

const actual = signRequest(VECTOR.merchantTill, VECTOR.timestamp, VECTOR.nonce, VECTOR.secret);

console.log(`canonical string : ${VECTOR.merchantTill}|${VECTOR.timestamp}|${VECTOR.nonce}`);
console.log(`expected         : ${VECTOR.expected}`);
console.log(`computed         : ${actual}`);

if (actual !== VECTOR.expected) {
  console.error("\nFAIL — signing does not match LOOP's worked example. Signed calls will be rejected.");
  process.exit(1);
}

// Guard the two encodings LOOP explicitly rejects.
if (actual !== actual.toLowerCase()) {
  console.error("\nFAIL — digest must be lowercase hex.");
  process.exit(1);
}

console.log("\nPASS — signing matches LOOP's worked example (lowercase hex HMAC-SHA256).");
