import type { Board, BoardSummary, Transaction } from "@/lib/types";

export type RangeKey = "7d" | "30d" | "90d" | "all";

export const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

export function rangeDays(key: RangeKey): number | null {
  return RANGES.find((r) => r.key === key)?.days ?? 30;
}

/** One filter row scopes everything below it, so every view slices the same way. */
export function withinRange(transactions: Transaction[], key: RangeKey): Transaction[] {
  const days = rangeDays(key);
  if (days === null) return transactions;
  const cutoff = Date.now() - days * 86_400_000;
  return transactions.filter((t) => Date.parse(t.timestamp) >= cutoff);
}

const NEAR_BUDGET = 0.8;

export function summariseBoards(boards: Board[], transactions: Transaction[]): BoardSummary[] {
  const byBoard = new Map<string, Transaction[]>();
  for (const txn of transactions) {
    if (!txn.boardId) continue;
    const bucket = byBoard.get(txn.boardId);
    if (bucket) bucket.push(txn);
    else byBoard.set(txn.boardId, [txn]);
  }

  return boards.map((board) => {
    const items = byBoard.get(board.id) ?? [];
    const spent = items.filter((t) => t.direction === "debit").reduce((sum, t) => sum + t.amount, 0);
    const received = items.filter((t) => t.direction === "credit").reduce((sum, t) => sum + t.amount, 0);

    const timestamps = items.map((t) => Date.parse(t.timestamp)).sort((a, b) => a - b);
    const budgetUsedPct = board.budgetAmount && board.budgetAmount > 0 ? (spent / board.budgetAmount) * 100 : null;

    const budgetState: BoardSummary["budgetState"] =
      budgetUsedPct === null ? "none" : budgetUsedPct >= 100 ? "over" : budgetUsedPct >= NEAR_BUDGET * 100 ? "near" : "ok";

    return {
      board,
      spent,
      received,
      transactionCount: items.length,
      firstAt: timestamps.length ? new Date(timestamps[0]).toISOString() : null,
      lastAt: timestamps.length ? new Date(timestamps[timestamps.length - 1]).toISOString() : null,
      budgetUsedPct,
      budgetState,
    };
  });
}

export interface DayPoint {
  /** ISO date, midnight local */
  date: string;
  spent: number;
  received: number;
}

/** Daily spend series for the trend chart — zero-filled so gaps read as zero, not as missing. */
export function spendByDay(transactions: Transaction[], days: number): DayPoint[] {
  const buckets = new Map<string, DayPoint>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, spent: 0, received: 0 });
  }

  for (const txn of transactions) {
    const key = new Date(txn.timestamp).toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (txn.direction === "debit") bucket.spent += txn.amount;
    else bucket.received += txn.amount;
  }

  return [...buckets.values()];
}

export interface Totals {
  spent: number;
  received: number;
  net: number;
  transactionCount: number;
  untagged: number;
  untaggedAmount: number;
  boardsOverBudget: number;
  boardsNearBudget: number;
}

export function computeTotals(transactions: Transaction[], summaries: BoardSummary[]): Totals {
  const spent = transactions.filter((t) => t.direction === "debit").reduce((s, t) => s + t.amount, 0);
  const received = transactions.filter((t) => t.direction === "credit").reduce((s, t) => s + t.amount, 0);
  const untaggedTxns = transactions.filter((t) => !t.boardId);

  return {
    spent,
    received,
    net: received - spent,
    transactionCount: transactions.length,
    untagged: untaggedTxns.length,
    untaggedAmount: untaggedTxns.filter((t) => t.direction === "debit").reduce((s, t) => s + t.amount, 0),
    boardsOverBudget: summaries.filter((s) => s.budgetState === "over").length,
    boardsNearBudget: summaries.filter((s) => s.budgetState === "near").length,
  };
}

/**
 * Change vs the equivalent window immediately before this one.
 * Returns null when there's no prior data to compare against, so the UI can
 * omit the delta instead of printing a meaningless +100%.
 */
export function periodDelta(all: Transaction[], days: number): number | null {
  const now = Date.now();
  const windowMs = days * 86_400_000;

  const sum = (from: number, to: number) =>
    all
      .filter((t) => t.direction === "debit")
      .filter((t) => {
        const at = Date.parse(t.timestamp);
        return at >= from && at < to;
      })
      .reduce((s, t) => s + t.amount, 0);

  const current = sum(now - windowMs, now);
  const previous = sum(now - 2 * windowMs, now - windowMs);
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Charts never invent a ninth categorical hue: the top 8 Boards keep their own
 * colour and the tail folds into a single grey "Other".
 */
export interface ChartSlice {
  id: string;
  label: string;
  colorCode: string;
  value: number;
}

export function toChartSlices(summaries: BoardSummary[], max = 8): ChartSlice[] {
  const ranked = summaries.filter((s) => s.spent > 0).sort((a, b) => b.spent - a.spent);
  const head = ranked.slice(0, max).map((s) => ({
    id: s.board.id,
    label: s.board.name,
    // Colour follows the entity, not its rank — filtering never repaints survivors.
    colorCode: s.board.colorCode,
    value: s.spent,
  }));

  const tail = ranked.slice(max);
  if (tail.length > 0) {
    head.push({
      id: "other",
      label: `Other (${tail.length} boards)`,
      colorCode: "other",
      value: tail.reduce((sum, s) => sum + s.spent, 0),
    });
  }

  return head;
}
