import "server-only";
import crypto from "node:crypto";
import { loopConfig, isDemoMode } from "./config";
import { LoopApiError } from "./client";

/**
 * LOOP authentication.
 *
 * Machine-to-machine only: Basic(Consumer Key:Consumer Secret) against the
 * Authorisation API returns a Bearer token good for the whole app. There is no
 * per-user login in LOOP's API surface, so the thing a person proves when they
 * sign in to Chroma is possession of a *till secret* — verified by making a
 * real signed call to LOOP on their behalf (see verifyTill).
 */

interface CachedToken {
  accessToken: string;
  /** epoch ms */
  expiresAt: number;
}

// One token per process, shared across requests — it's app-wide, not per user.
const globalRef = globalThis as unknown as { __loopToken?: CachedToken };

interface RawTokenResponse {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

/** Refresh a minute early so an in-flight call can't race the expiry. */
function isFresh(token: CachedToken | undefined): token is CachedToken {
  return Boolean(token && Date.now() < token.expiresAt - 60_000);
}

export async function getAccessToken(): Promise<string> {
  if (isDemoMode()) return "demo-gateway-token";

  const cached = globalRef.__loopToken;
  if (isFresh(cached)) return cached.accessToken;

  const { consumerKey, consumerSecret, tokenUrl } = loopConfig;
  if (!consumerKey || !consumerSecret) {
    throw new Error("LOOP_CONSUMER_KEY / LOOP_CONSUMER_SECRET are not configured.");
  }

  const basic = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  const res = await fetch(tokenUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });

  const text = await res.text();
  if (!res.ok) throw new LoopApiError("auth/oauth2/token", res.status, text.slice(0, 400));

  let raw: RawTokenResponse;
  try {
    raw = JSON.parse(text) as RawTokenResponse;
  } catch {
    throw new LoopApiError("auth/oauth2/token", res.status, text.slice(0, 400));
  }

  if (!raw.access_token) {
    throw new LoopApiError("auth/oauth2/token", res.status, raw.error_description ?? raw.error ?? text.slice(0, 400));
  }

  const token: CachedToken = {
    accessToken: raw.access_token,
    expiresAt: Date.now() + (raw.expires_in ?? 3600) * 1000,
  };
  globalRef.__loopToken = token;
  return token.accessToken;
}

/* ── Request signing ────────────────────────────────────────────────────── */

/**
 * Lowercase hex HMAC-SHA256 over "merchantTill|timestamp|nonce", keyed with the
 * till's secret. Base64 or uppercase hex will not verify.
 */
export function signRequest(merchantTill: string, timestamp: string, nonce: string, tillSecret: string): string {
  return crypto
    .createHmac("sha256", tillSecret)
    .update(`${merchantTill}|${timestamp}|${nonce}`, "utf8")
    .digest("hex");
}

/** ISO-8601 UTC, second precision — anything else is rejected as a replay. */
export function loopTimestamp(at: Date = new Date()): string {
  return `${at.toISOString().slice(0, 19)}Z`;
}

/** Fresh lowercase UUID v4 per call; reuse inside the replay window is rejected. */
export function loopNonce(): string {
  return crypto.randomUUID().toLowerCase();
}

/**
 * Envelope reference. Must be unique per call — LOOP refuses a repeat as a
 * duplicate, even for the same till.
 */
export function loopTxnReference(): string {
  return crypto.randomUUID();
}
