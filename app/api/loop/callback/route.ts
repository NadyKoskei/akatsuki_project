import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens, fetchLoopProfile } from "@/lib/loop/auth";
import { isDemoMode } from "@/lib/loop/config";
import { DEMO_PROFILE } from "@/lib/loop/demo";
import { OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE } from "@/lib/auth/oauth-cookies";
import { createSession } from "@/lib/auth/session";
import { saveTokens, upsertUserFromLoop, listTransactions } from "@/lib/db/store";
import { autoFileDemoTransactions, seedStarterBoards, syncFromLoop } from "@/lib/services/sync";
import type { LoopTokenSet } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(request: NextRequest, reason: string, detail?: string) {
  const url = new URL("/", request.nextUrl.origin);
  url.searchParams.set("error", reason);
  if (detail) url.searchParams.set("detail", detail.slice(0, 300));
  return NextResponse.redirect(url);
}

/**
 * LOOP's authorisation callback — and the only door into Chroma.
 *
 * A User row is created here and nowhere else: no email signup, no password,
 * no invite path. If LOOP doesn't authorise you, you have no account.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const jar = await cookies();

  const expectedState = jar.get(OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = jar.get(OAUTH_VERIFIER_COOKIE)?.value;
  jar.delete(OAUTH_STATE_COOKIE);
  jar.delete(OAUTH_VERIFIER_COOKIE);

  // LOOP told us it went wrong (user declined, bad client, etc.)
  const loopError = params.get("error");
  if (loopError) return fail(request, "loop_denied", params.get("error_description") ?? loopError);

  const code = params.get("code");
  const state = params.get("state");

  if (!code || !state) return fail(request, "invalid_callback", "Missing authorization code or state.");
  if (!expectedState || !codeVerifier) return fail(request, "state_expired", "Sign-in took too long. Try again.");
  if (state !== expectedState) return fail(request, "state_mismatch", "State check failed. Start sign-in again.");

  try {
    const demo = isDemoMode();

    // 1. Prove the authorisation, get tokens + who authorised us.
    const tokens: LoopTokenSet = demo
      ? {
          accessToken: `demo.${state.slice(0, 24)}`,
          expiresAt: Date.now() + 12 * 3600_000,
          tokenType: "Bearer",
          scope: "accounts.read transactions.read",
        }
      : await exchangeCodeForTokens(code, codeVerifier);

    const profile = demo ? DEMO_PROFILE : await fetchLoopProfile(tokens.accessToken);

    // 2. Create-or-update the Chroma user for that LOOP account.
    const user = await upsertUserFromLoop({
      loopAccountRef: profile.accountRef,
      name: profile.name,
      phoneNumber: profile.phoneNumber,
      userType: profile.userType,
    });
    await saveTokens(user.id, tokens);

    // 3. First-run: give them Boards, then pull their history.
    const isFirstRun = (await listTransactions(user.id)).length === 0;
    await seedStarterBoards(user.id, user.userType);

    try {
      await syncFromLoop({
        userId: user.id,
        accountRef: profile.accountRef,
        accessToken: tokens.accessToken,
      });
      if (isFirstRun) await autoFileDemoTransactions(user.id);
    } catch {
      // Sign-in must not fail because the sandbox is slow; the dashboard
      // offers a manual sync and will retry.
    }

    // 4. Mint the session.
    await createSession({
      id: user.id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      userType: user.userType,
      loopAccountRef: user.loopAccountRef,
      demo,
    });

    return NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin));
  } catch (err) {
    return fail(request, "loop_exchange_failed", err instanceof Error ? err.message : "Unknown error");
  }
}
