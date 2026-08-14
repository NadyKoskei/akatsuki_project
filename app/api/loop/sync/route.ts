import { NextResponse } from "next/server";
import { getTillCredentials, getSession } from "@/lib/auth/session";
import { syncFromLoop } from "@/lib/services/sync";
import { LoopApiError } from "@/lib/loop/client";
import { getLastSync } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Manual pull. The dashboard also syncs on sign-in; this is the refresh button. */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const credentials = await getTillCredentials(session.id);
    const result = await syncFromLoop({ userId: session.id, credentials });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof LoopApiError) {
      if (err.isAuthFailure) {
        return NextResponse.json(
          { error: `LOOP rejected the stored till credentials. Reconnect the till. ${err.detail}` },
          { status: 401 },
        );
      }
      if (err.isRateLimited) {
        return NextResponse.json(
          {
            error: "LOOP is rate-limiting us. Your existing transactions are still here.",
            lastSync: await getLastSync(session.id),
          },
          { status: 429 },
        );
      }
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed." },
      { status: 502 },
    );
  }
}
