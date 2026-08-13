import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/loop/config";
import { demoLiveTransaction } from "@/lib/loop/demo";
import { normaliseTransaction } from "@/lib/loop/transactions";
import { upsertTransactions } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fires a simulated IPN at the signed-in account so the live tagging prompt can
 * be demonstrated without waiting for a real sandbox payment. Demo mode only —
 * against live LOOP data this would be fabricating a transaction.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!isDemoMode()) {
    return NextResponse.json(
      { error: "Simulated notifications are disabled when Chroma is connected to the live LOOP sandbox." },
      { status: 403 },
    );
  }

  const raw = demoLiveTransaction(session.loopAccountRef);
  const txn = normaliseTransaction(raw, session.id);
  if (!txn) return NextResponse.json({ error: "Could not build the demo transaction." }, { status: 500 });

  await upsertTransactions([{ ...txn, live: true }]);
  return NextResponse.json({ transaction: { ...txn, live: true } });
}
