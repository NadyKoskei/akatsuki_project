import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { tagTransaction } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The one-tap answer to "which Board is this for?". */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: { boardId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const boardId = body.boardId === null ? null : typeof body.boardId === "string" ? body.boardId : undefined;
  if (boardId === undefined) {
    return NextResponse.json({ error: "boardId must be a Board id or null." }, { status: 400 });
  }

  const txn = await tagTransaction(session.id, id, boardId);
  if (!txn) return NextResponse.json({ error: "Transaction or Board not found." }, { status: 404 });
  return NextResponse.json({ transaction: txn });
}
