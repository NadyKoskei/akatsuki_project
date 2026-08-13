import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createStandingOrder, getBoard, listStandingOrders } from "@/lib/db/store";
import type { StandingOrderFrequency, StandingOrderKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: StandingOrderKind[] = ["bill", "savings", "investment"];
const FREQUENCIES: StandingOrderFrequency[] = ["weekly", "monthly"];

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ orders: await listStandingOrders(session.id) });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Give the standing order a name." }, { status: 400 });

  const destination = typeof body.destination === "string" ? body.destination.trim() : "";
  if (!destination) {
    return NextResponse.json({ error: "A paybill, till or account reference is required." }, { status: 400 });
  }

  const major = Number(body.amount);
  if (!Number.isFinite(major) || major <= 0) {
    return NextResponse.json({ error: "Amount must be greater than zero." }, { status: 400 });
  }

  const kind = KINDS.includes(body.kind as StandingOrderKind) ? (body.kind as StandingOrderKind) : "bill";
  const frequency = FREQUENCIES.includes(body.frequency as StandingOrderFrequency)
    ? (body.frequency as StandingOrderFrequency)
    : "monthly";

  // A Board is optional, but if one is named it has to be the user's own.
  const boardId = typeof body.boardId === "string" && body.boardId ? body.boardId : null;
  if (boardId && !(await getBoard(session.id, boardId))) {
    return NextResponse.json({ error: "That Board doesn't exist." }, { status: 404 });
  }

  const startsAt = typeof body.startsAt === "string" ? new Date(body.startsAt) : new Date();
  if (Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: "Start date isn't a valid date." }, { status: 400 });
  }

  const order = await createStandingOrder({
    userId: session.id,
    name: name.slice(0, 60),
    kind,
    amount: Math.round(major * 100),
    currency: typeof body.currency === "string" ? body.currency : "KES",
    frequency,
    destination: destination.slice(0, 60),
    reference: typeof body.reference === "string" && body.reference.trim() ? body.reference.trim().slice(0, 60) : null,
    boardId,
    status: "active",
    nextRunAt: startsAt.toISOString(),
  });

  return NextResponse.json({ order }, { status: 201 });
}
