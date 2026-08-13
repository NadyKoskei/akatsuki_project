import "server-only";
import crypto from "node:crypto";
import { loopConfig } from "./config";
import type { RawLoopTransaction } from "./transactions";

/**
 * Instant Payment Notification intake.
 *
 * LOOP posts a transaction the moment it lands; Chroma verifies the signature,
 * normalises it through the same path as a history pull, and surfaces it to the
 * user as "which Board is this for?".
 */

export interface IpnEnvelope {
  accountRef: string;
  transaction: RawLoopTransaction;
}

/**
 * HMAC-SHA256 over the exact raw body, compared in constant time.
 *
 * The body must be the unparsed string — re-serialising JSON reorders keys and
 * breaks the digest.
 */
export function verifyIpnSignature(rawBody: string, signatureHeader: string | null): boolean {
  // No secret means nothing can be verified, so nothing is accepted — this
  // endpoint is public, and an unsigned payload would let anyone write
  // transactions into an account. The demo path is /api/loop/ipn/demo, which
  // is behind a session instead.
  if (!loopConfig.apiSecret) return false;
  if (!signatureHeader) return false;

  // Accept both "sha256=<hex>" and a bare hex digest.
  const provided = signatureHeader.trim().replace(/^sha256=/i, "");
  const expected = crypto.createHmac("sha256", loopConfig.apiSecret).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

/** LOOP wraps the transaction differently per event type; unwrap them all here. */
export function parseIpnPayload(payload: unknown): IpnEnvelope | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;

  const txn = (body.transaction ?? body.data ?? body) as RawLoopTransaction;
  if (!txn || typeof txn !== "object") return null;

  const accountRef =
    (body.account_reference as string | undefined) ??
    (body.account_id as string | undefined) ??
    txn.account_reference;

  if (!accountRef) return null;
  return { accountRef: String(accountRef), transaction: txn };
}
