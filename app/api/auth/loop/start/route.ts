import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { buildAuthorizeUrl } from "@/lib/loop/auth";
import { assertSandbox, isDemoMode, hasLiveCredentials, missingCredentialError } from "@/lib/loop/config";
import { OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE, OAUTH_STATE_TTL_S } from "@/lib/auth/oauth-cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sign-in entry point — the only one Chroma has.
 *
 * Hands the browser to LOOP's authorize screen with PKCE + CSRF state. In demo
 * mode (the seeded sandbox fallback) it short-circuits to our own callback with
 * the same state handshake, so the callback path is exercised identically.
 */
export async function GET(request: NextRequest) {
  try {
    assertSandbox();
  } catch (err) {
    const detail = encodeURIComponent((err as Error).message);
    return NextResponse.redirect(new URL(`/?error=config&detail=${detail}`, request.nextUrl.origin));
  }

  const demo = isDemoMode();
  if (!demo && !hasLiveCredentials()) {
    const detail = encodeURIComponent(missingCredentialError().message);
    return NextResponse.redirect(new URL(`/?error=config&detail=${detail}`, request.nextUrl.origin));
  }

  const { authorizeUrl, state, codeVerifier } = buildAuthorizeUrl();

  const jar = await cookies();
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OAUTH_STATE_TTL_S,
  };
  jar.set(OAUTH_STATE_COOKIE, state, cookieOptions);
  jar.set(OAUTH_VERIFIER_COOKIE, codeVerifier, cookieOptions);

  if (demo) {
    const callback = new URL("/api/loop/callback", request.nextUrl.origin);
    callback.searchParams.set("code", `demo.${state.slice(0, 12)}`);
    callback.searchParams.set("state", state);
    return NextResponse.redirect(callback);
  }

  return NextResponse.redirect(authorizeUrl);
}
