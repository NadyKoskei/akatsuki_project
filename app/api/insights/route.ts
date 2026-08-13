import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listBoards, listInsights, listTransactions, replaceInsights } from "@/lib/db/store";
import { computeTotals, rangeDays, summariseBoards, withinRange, type RangeKey } from "@/lib/services/analytics";
import { generateInsights } from "@/lib/services/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ insights: listInsights(session.id) });
}

/** Regenerates insights over the requested window. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let range: RangeKey = "30d";
  try {
    const body = (await request.json()) as { range?: RangeKey };
    if (body.range) range = body.range;
  } catch {
    // No body is fine — default window.
  }

  const boards = listBoards(session.id);
  const all = listTransactions(session.id);
  const scoped = withinRange(all, range);
  const summaries = summariseBoards(boards, scoped);
  const totals = computeTotals(scoped, summaries);

  const drafts = await generateInsights({
    userId: session.id,
    summaries,
    transactions: all,
    totals,
    rangeDays: rangeDays(range) ?? 90,
    currency: scoped[0]?.currency ?? "KES",
  });

  const insights = replaceInsights(session.id, drafts);
  return NextResponse.json({ insights });
}
