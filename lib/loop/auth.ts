import "server-only";
import crypto from "node:crypto";
import { loopConfig } from "./config";
import { loopRequest } from "./client";
import type { LoopTokenSet, UserType } from "@/lib/types";

/**
 * LOOP is the only identity provider Chroma has.
 *
 * There is no password, no email signup, no "create a Chroma account" path —
 * a user row is created exclusively as a side effect of a successful LOOP
 * authorisation callback. Chroma stores the returned token set, never raw
 * credentials.
 */

export interface OAuthStartState {
  authorizeUrl: string;
  state: string;
  codeVerifier: string;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Builds the LOOP authorize URL with PKCE (S256) and CSRF state. */
export function buildAuthorizeUrl(): OAuthStartState {
  const state = base64url(crypto.randomBytes(24));
  const codeVerifier = base64url(crypto.randomBytes(48));
  const codeChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());

  const url = new URL(loopConfig.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", loopConfig.clientId ?? "");
  url.searchParams.set("redirect_uri", loopConfig.redirectUri);
  url.searchParams.set("scope", loopConfig.scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return { authorizeUrl: url.toString(), state, codeVerifier };
}

interface RawTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

function toTokenSet(raw: RawTokenResponse): LoopTokenSet {
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    // Default to 30 min if the sandbox omits expires_in; refresh handles the rest.
    expiresAt: Date.now() + (raw.expires_in ?? 1800) * 1000,
    tokenType: raw.token_type ?? "Bearer",
    scope: raw.scope,
  };
}

/** Exchanges the one-time authorization code for a token set. */
export async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<LoopTokenSet> {
  const raw = await loopRequest<RawTokenResponse>(loopConfig.tokenUrl, {
    method: "POST",
    retries: 2,
    body: {
      grant_type: "authorization_code",
      code,
      redirect_uri: loopConfig.redirectUri,
      client_id: loopConfig.clientId,
      client_secret: loopConfig.apiSecret,
      code_verifier: codeVerifier,
    },
  });

  if (!raw?.access_token) throw new Error("LOOP token exchange returned no access_token");
  return toTokenSet(raw);
}

export async function refreshTokens(refreshToken: string): Promise<LoopTokenSet> {
  const raw = await loopRequest<RawTokenResponse>(loopConfig.tokenUrl, {
    method: "POST",
    retries: 2,
    body: {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: loopConfig.clientId,
      client_secret: loopConfig.apiSecret,
    },
  });

  if (!raw?.access_token) throw new Error("LOOP token refresh returned no access_token");
  return toTokenSet(raw);
}

/** Refresh a minute before expiry so an in-flight request doesn't race the clock. */
export function isExpired(tokens: LoopTokenSet): boolean {
  return Date.now() > tokens.expiresAt - 60_000;
}

export interface LoopProfile {
  accountRef: string;
  name: string;
  phoneNumber: string;
  userType: UserType;
}

interface RawProfile {
  id?: string;
  account_id?: string;
  account_reference?: string;
  name?: string;
  full_name?: string;
  customer_name?: string;
  phone?: string;
  phone_number?: string;
  msisdn?: string;
  account_type?: string;
  customer_type?: string;
}

/** Pulls the connected account's profile and normalises the field-name variance. */
export async function fetchLoopProfile(accessToken: string): Promise<LoopProfile> {
  const raw = await loopRequest<RawProfile>("/accounts/me", { accessToken });

  const accountRef = raw.account_reference ?? raw.account_id ?? raw.id;
  if (!accountRef) throw new Error("LOOP profile response carried no account reference");

  const rawType = (raw.account_type ?? raw.customer_type ?? "").toLowerCase();
  const userType: UserType = rawType.includes("business") || rawType.includes("merchant")
    ? "business"
    : rawType.includes("student")
      ? "student"
      : "individual";

  return {
    accountRef: String(accountRef),
    name: raw.name ?? raw.full_name ?? raw.customer_name ?? "LOOP account",
    phoneNumber: raw.phone_number ?? raw.phone ?? raw.msisdn ?? "",
    userType,
  };
}
