import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { deleteStandingOrder, getBoard, updateStandingOrder } from "@/lib/db/store";
import type { StandingOrder } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const patch: Partial<Omit<StandingOrder, "id" | "userId" | "createdAt">> = {};

  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 60);
  if (typeof body.destination === "string" && body.destination.trim()) {
    patch.destination = body.destination.trim().slice(0, 60);
  }
  if (body.amount !== undefined) {
    const major = Number(body.amount);
    if (!Number.isFinite(major) || major <= 0) {
      return NextResponse.json({ error: "Amount must be greater than zero." }, { status: 400 });
    }
    patch.amount = Math.round(major * 100);
  }
  if (body.status === "active" || body.status === "paused") patch.status = body.status;
  if (body.frequency === "weekly" || body.frequency === "monthly") patch.frequency = body.frequency;

  if (body.boardId !== undefined) {
    const boardId = typeof body.boardId === "string" && body.boardId ? body.boardId : null;
    if (boardId && !(await getBoard(session.id, boardId))) {
      return NextResponse.json({ error: "That Board doesn't exist." }, { status: 404 });
    }
    patch.boardId = boardId;
  }

  if (typeof body.nextRunAt === "string") {
    const when = new Date(body.nextRunAt);
    if (Number.isNaN(when.getTime())) return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    patch.nextRunAt = when.toISOString();
  }

  const order = await updateStandingOrder(session.id, id, patch);
  if (!order) return NextResponse.json({ error: "Standing order not found." }, { status: 404 });
  return NextResponse.json({ order });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const ok = await deleteStandingOrder(session.id, id);
  if (!ok) return NextResponse.json({ error: "Standing order not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
