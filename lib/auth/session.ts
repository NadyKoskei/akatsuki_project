import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, signSession, verifySession } from "./token";
import { getTokens, saveTokens, getUser } from "@/lib/db/store";
import { isExpired, refreshTokens } from "@/lib/loop/auth";
import { isDemoMode } from "@/lib/loop/config";
import type { LoopTokenSet, SessionUser } from "@/lib/types";

/** A LOOP authorisation is the only thing that mints a session. */
export async function createSession(user: SessionUser): Promise<void> {
  const token = await signSession(user);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  // A signed session for a user we no longer hold is not a session.
  return getUser(session.id) ? session : null;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("A connected LOOP account is required.");
    this.name = "UnauthorizedError";
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

/**
 * Returns a usable LOOP access token for the session, refreshing it first if
 * it's within a minute of expiry. Demo sessions get a sentinel token — the LOOP
 * modules branch on demo mode before ever putting it on the wire.
 */
export async function getLoopAccessToken(userId: string): Promise<string> {
  const tokens = getTokens(userId);

  if (!tokens) {
    if (isDemoMode()) return "demo-session-token";
    throw new UnauthorizedError();
  }

  if (!isExpired(tokens)) return tokens.accessToken;

  if (!tokens.refreshToken) {
    if (isDemoMode()) return tokens.accessToken;
    throw new UnauthorizedError();
  }

  const refreshed: LoopTokenSet = await refreshTokens(tokens.refreshToken);
  saveTokens(userId, refreshed);
  return refreshed.accessToken;
}
