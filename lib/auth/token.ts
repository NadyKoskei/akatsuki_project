import { SignJWT, jwtVerify } from "jose";
import { requireSecret } from "@/lib/env";
import type { SessionUser, UserType } from "@/lib/types";

/**
 * Session token primitives.
 *
 * Kept free of node: imports so the edge middleware can verify a session
 * without pulling in the Node runtime. Cookie handling lives in session.ts.
 *
 * The token asserts one thing: "this browser holds a LOOP authorisation for
 * account X". It is never a credential for LOOP itself — the LOOP token set
 * stays server-side, encrypted.
 */

export const SESSION_COOKIE = "chroma_session";
export const SESSION_MAX_AGE_S = 60 * 60 * 12;

const ISSUER = "chroma";
const AUDIENCE = "chroma-app";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(requireSecret("JWT_SECRET"));
}

export interface SessionClaims extends SessionUser {
  exp?: number;
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({
    name: user.name,
    phoneNumber: user.phoneNumber,
    userType: user.userType,
    loopAccountRef: user.loopAccountRef,
    demo: user.demo,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_S}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: ISSUER, audience: AUDIENCE });
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      name: String(payload.name ?? "LOOP account"),
      phoneNumber: String(payload.phoneNumber ?? ""),
      userType: (payload.userType as UserType) ?? "individual",
      loopAccountRef: String(payload.loopAccountRef ?? ""),
      demo: Boolean(payload.demo),
    };
  } catch {
    // Expired, tampered, or signed with a rotated secret — all mean "no session".
    return null;
  }
}
