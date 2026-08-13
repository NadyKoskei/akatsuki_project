import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createBoard, listBoards } from "@/lib/db/store";
import { BOARD_COLORS, nextColor } from "@/lib/palette";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ boards: await listBoards(session.id) });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { name?: unknown; colorCode?: unknown; budgetAmount?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "A Board needs a name." }, { status: 400 });
  if (name.length > 40) return NextResponse.json({ error: "Board names cap at 40 characters." }, { status: 400 });

  const existing = await listBoards(session.id);
  if (existing.length >= 24) {
    return NextResponse.json({ error: "24 Boards is the limit for the sandbox build." }, { status: 400 });
  }

  // Only palette slots are accepted — an arbitrary hex would break dark mode
  // and the chart's colour-blindness guarantees.
  const requested = typeof body.colorCode === "string" ? body.colorCode : "";
  const colorCode = BOARD_COLORS.some((c) => c.key === requested)
    ? requested
    : nextColor(existing.map((b) => b.colorCode));

  const rawBudget = body.budgetAmount;
  const budgetAmount =
    rawBudget === null || rawBudget === undefined || rawBudget === ""
      ? null
      : Math.max(0, Math.round(Number(rawBudget) * 100));
  if (budgetAmount !== null && !Number.isFinite(budgetAmount)) {
    return NextResponse.json({ error: "Budget must be a number." }, { status: 400 });
  }

  const board = await createBoard({ userId: session.id, name, colorCode, budgetAmount });
  return NextResponse.json({ board }, { status: 201 });
}
