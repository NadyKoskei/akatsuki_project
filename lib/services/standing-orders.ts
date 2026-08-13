import "server-only";
import { getLoopAccessToken } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/loop/config";
import { initiateTransfer } from "@/lib/loop/payments";
import { listDueStandingOrders, updateStandingOrder, upsertTransactions } from "@/lib/db/store";
import type { StandingOrder, StandingOrderRunResult, Transaction } from "@/lib/types";

/**
 * Standing orders — the recurring side of money: bills, savings, investments.
 *
 * An order is an instruction Chroma holds, not money it holds. When one falls
 * due the runner asks LOOP to move the money and files the result to the
 * order's Board, so a monthly rent payment or a weekly savings sweep lands in
 * the right Board without anyone tagging it.
 */

const MAX_PER_RUN = 50;

/**
 * Next occurrence after `from`.
 *
 * Monthly clamps to the end of shorter months — an order set for the 31st runs
 * on the 30th in April rather than skipping into May.
 */
export function nextRunAfter(from: Date, frequency: StandingOrder["frequency"], anchorDay?: number): string {
  const next = new Date(from.getTime());

  if (frequency === "weekly") {
    next.setDate(next.getDate() + 7);
    return next.toISOString();
  }

  const day = anchorDay ?? next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + 1);
  const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, daysInMonth));
  return next.toISOString();
}

/** A stable, human-recognisable reference so the payment can be matched later. */
function referenceFor(order: StandingOrder, at: Date): string {
  return `CHROMA-${order.kind.toUpperCase().slice(0, 4)}-${order.id.slice(-6).toUpperCase()}-${at
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "")}`;
}

export async function runStandingOrder(order: StandingOrder): Promise<StandingOrderRunResult> {
  const now = new Date();
  const reference = referenceFor(order, now);

  try {
    const accessToken = await getLoopAccessToken(order.userId);

    const result = await initiateTransfer({
      accessToken,
      accountRef: order.destination,
      amount: order.amount,
      currency: order.currency,
      destination: order.destination,
      narrative: order.name,
      clientReference: reference,
    });

    if (result.status === "failed") {
      return { orderId: order.id, name: order.name, status: "failed", detail: "LOOP rejected the transfer." };
    }

    // In demo mode we synthesise the debit so the Board reflects it straight
    // away. Against live LOOP we only record what LOOP actually gave us an id
    // for — otherwise the next sync would import the real transaction and we'd
    // be showing the same payment twice.
    let transactionId: string | undefined;
    const loopId = result.loopTransactionId ?? (isDemoMode() ? `STD-${reference}` : null);

    if (loopId) {
      const txn: Transaction = {
        id: `txn_${order.userId}_${loopId}`,
        userId: order.userId,
        loopTransactionId: loopId,
        amount: order.amount,
        currency: order.currency,
        direction: "debit",
        timestamp: now.toISOString(),
        counterparty: order.name,
        source: order.kind === "bill" ? "paybill" : "transfer",
        description:
          order.kind === "savings" ? "Standing order · savings" : order.kind === "investment" ? "Standing order · investment" : "Standing order · bill",
        reference,
        // Filed immediately: the user already said which Board this belongs to
        // when they created the order.
        boardId: order.boardId,
      };
      await upsertTransactions([txn]);
      transactionId = txn.id;
    }

    await updateStandingOrder(order.userId, order.id, {
      lastRunAt: now.toISOString(),
      nextRunAt: nextRunAfter(now, order.frequency, new Date(order.nextRunAt).getDate()),
    });

    return {
      orderId: order.id,
      name: order.name,
      status: "sent",
      detail: `${order.currency} ${(order.amount / 100).toLocaleString("en-KE")} to ${order.destination}`,
      transactionId,
    };
  } catch (err) {
    // A failed run must not wedge the schedule: push it to the next occurrence
    // so one bad night doesn't fire repeatedly for the rest of the month.
    await updateStandingOrder(order.userId, order.id, {
      nextRunAt: nextRunAfter(now, order.frequency, new Date(order.nextRunAt).getDate()),
    });

    return {
      orderId: order.id,
      name: order.name,
      status: "failed",
      detail: err instanceof Error ? err.message : "Transfer failed.",
    };
  }
}

/** Every active order that has come due, across all users. Called by the scheduler. */
export async function runDueStandingOrders(limit = MAX_PER_RUN): Promise<StandingOrderRunResult[]> {
  const due = await listDueStandingOrders(new Date().toISOString(), limit);

  const results: StandingOrderRunResult[] = [];
  // Sequential on purpose: these move money, and a burst of parallel transfers
  // is the wrong thing to aim at a sandbox.
  for (const order of due) {
    results.push(await runStandingOrder(order));
  }
  return results;
}

/** Total committed per period, for the dashboard summary. */
export function monthlyCommitment(orders: StandingOrder[]): number {
  return orders
    .filter((o) => o.status === "active")
    .reduce((sum, o) => sum + (o.frequency === "weekly" ? Math.round((o.amount * 52) / 12) : o.amount), 0);
}
