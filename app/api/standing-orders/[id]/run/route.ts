import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getStandingOrder } from "@/lib/db/store";
import { runStandingOrder } from "@/lib/services/standing-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Pay now" — runs one order ahead of its schedule, and advances it. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const order = await getStandingOrder(session.id, id);
  if (!order) return NextResponse.json({ error: "Standing order not found." }, { status: 404 });

  const result = await runStandingOrder(order);
  return NextResponse.json({ result }, { status: result.status === "failed" ? 502 : 200 });
}
