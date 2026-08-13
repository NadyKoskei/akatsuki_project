import { NextResponse, type NextRequest } from "next/server";
import { parseIpnPayload, verifyIpnSignature } from "@/lib/loop/ipn";
import { normaliseTransaction } from "@/lib/loop/transactions";
import { findUserByLoopRef, upsertTransactions } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * LOOP Instant Payment Notification.
 *
 * Unauthenticated by session on purpose — LOOP calls it, not the browser — so
 * the HMAC signature over the raw body is the only thing that lets a payload in.
 */
export async function POST(request: NextRequest) {
  // Raw text, not request.json(): re-serialising would reorder keys and break the digest.
  const raw = await request.text();

  const signature =
    request.headers.get("x-loop-signature") ??
    request.headers.get("x-signature") ??
    request.headers.get("loop-signature");

  if (!verifyIpnSignature(raw, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const envelope = parseIpnPayload(payload);
  if (!envelope) return NextResponse.json({ error: "unrecognised payload" }, { status: 400 });

  const user = await findUserByLoopRef(envelope.accountRef);
  // 200 on an unknown account: the notification is valid, we just don't hold
  // that account. Returning an error would make LOOP retry forever.
  if (!user) return NextResponse.json({ ok: true, matched: false });

  const txn = normaliseTransaction(envelope.transaction, user.id);
  if (!txn) return NextResponse.json({ error: "transaction missing id or timestamp" }, { status: 400 });

  // live:true puts it at the top of the "which Board is this for?" queue.
  await upsertTransactions([{ ...txn, live: true }]);

  return NextResponse.json({ ok: true, matched: true, transactionId: txn.id });
}
