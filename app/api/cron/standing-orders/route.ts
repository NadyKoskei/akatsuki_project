import { NextResponse, type NextRequest } from "next/server";
import { runDueStandingOrders } from "@/lib/services/standing-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Standing orders move money; give the run room rather than cutting it off.
export const maxDuration = 60;

/**
 * The scheduled runner. Vercel Cron calls this (see vercel.json); any other
 * scheduler can too, with the same bearer token.
 *
 * It is not session-gated — there is no user in a cron request — so
 * CRON_SECRET is the whole door. Without one configured the endpoint refuses
 * to run rather than defaulting open, since it initiates payments.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured, so the standing-order runner is disabled." },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = await runDueStandingOrders();

  return NextResponse.json({
    ran: results.length,
    sent: results.filter((r) => r.status === "sent").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  });
}
