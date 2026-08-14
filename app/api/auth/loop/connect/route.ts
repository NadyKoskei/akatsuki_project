import { NextResponse, type NextRequest } from "next/server";
import { assertSandbox, isDemoMode, hasLiveCredentials, missingCredentialError } from "@/lib/loop/config";
import { LoopApiError } from "@/lib/loop/client";
import { verifyTill } from "@/lib/loop/transactions";
import { createSession } from "@/lib/auth/session";
import { saveTokens, upsertUserFromLoop, listTransactions } from "@/lib/db/store";
import { autoFileDemoTransactions, seedStarterBoards, syncFromLoop } from "@/lib/services/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Connecting a LOOP till — the only way into Chroma.
 *
 * LOOP's API has no user login, so the thing a person proves here is
 * possession of a till's signing secret. That proof is a real signed call to
 * LOOP: if the history request verifies, they hold the secret; if it doesn't,
 * they don't get in. The secret is stored encrypted and never returned to the
 * browser.
 */
function fail(request: NextRequest, reason: string, detail?: string) {
  const url = new URL("/", request.nextUrl.origin);
  url.searchParams.set("error", reason);
  if (detail) url.searchParams.set("detail", detail.slice(0, 300));
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest) {
  try {
    assertSandbox();
  } catch (err) {
    return fail(request, "config", (err as Error).message);
  }

  if (!isDemoMode() && !hasLiveCredentials()) {
    return fail(request, "config", missingCredentialError().message);
  }

  const form = await request.formData();
  const merchantTill = String(form.get("merchantTill") ?? "").trim();
  const tillSecret = String(form.get("tillSecret") ?? "").trim();

  if (!merchantTill) return fail(request, "invalid_till", "Enter the till number issued to you.");
  if (!tillSecret && !isDemoMode()) {
    return fail(request, "invalid_till", "Enter the till's signing secret — it's what proves the till is yours.");
  }

  const credentials = { merchantTill, tillSecret: tillSecret || "demo-till-secret" };

  try {
    // The proof. A wrong secret produces a signature LOOP won't verify.
    await verifyTill(credentials);
  } catch (err) {
    if (err instanceof LoopApiError) {
      return fail(
        request,
        "till_rejected",
        err.isAuthFailure
          ? `LOOP rejected those credentials for till ${merchantTill}. ${err.detail}`
          : err.detail,
      );
    }
    return fail(request, "till_rejected", err instanceof Error ? err.message : "Could not reach LOOP.");
  }

  try {
    // Verified — so this till is who the account belongs to.
    const user = await upsertUserFromLoop({
      loopAccountRef: merchantTill,
      name: `Till ${merchantTill}`,
      phoneNumber: "",
      userType: "business",
    });

    await saveTokens(user.id, { merchantTill, tillSecret: credentials.tillSecret, connectedAt: new Date().toISOString() });

    const isFirstRun = (await listTransactions(user.id)).length === 0;
    await seedStarterBoards(user.id, user.userType);

    try {
      await syncFromLoop({ userId: user.id, credentials });
      if (isFirstRun) await autoFileDemoTransactions(user.id);
    } catch {
      // Sign-in shouldn't fail because the pull was slow; the dashboard has a
      // Sync button and will retry.
    }

    await createSession({
      id: user.id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      userType: user.userType,
      loopAccountRef: user.loopAccountRef,
      demo: isDemoMode(),
    });

    return NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin), { status: 303 });
  } catch (err) {
    const detail = err instanceof LoopApiError ? err.detail : err instanceof Error ? err.message : "Unknown error";
    return fail(request, "connect_failed", detail);
  }
}
