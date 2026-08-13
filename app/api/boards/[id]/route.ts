import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { deleteBoard, updateBoard } from "@/lib/db/store";
import { BOARD_COLORS } from "@/lib/palette";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: { name?: unknown; colorCode?: unknown; budgetAmount?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const patch: { name?: string; colorCode?: string; budgetAmount?: number | null } = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "A Board needs a name." }, { status: 400 });
    patch.name = name.slice(0, 40);
  }

  if (typeof body.colorCode === "string" && BOARD_COLORS.some((c) => c.key === body.colorCode)) {
    patch.colorCode = body.colorCode;
  }

  if ("budgetAmount" in body) {
    const raw = body.budgetAmount;
    patch.budgetAmount =
      raw === null || raw === undefined || raw === "" ? null : Math.max(0, Math.round(Number(raw) * 100));
    if (patch.budgetAmount !== null && !Number.isFinite(patch.budgetAmount)) {
      return NextResponse.json({ error: "Budget must be a number." }, { status: 400 });
    }
  }

  const board = await updateBoard(session.id, id, patch);
  if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });
  return NextResponse.json({ board });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  // Transactions survive — they belong to LOOP; only the tag goes away.
  const ok = await deleteBoard(session.id, id);
  if (!ok) return NextResponse.json({ error: "Board not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
