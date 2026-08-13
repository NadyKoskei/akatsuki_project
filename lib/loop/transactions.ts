import "server-only";
import { loopRequest } from "./client";
import { isDemoMode } from "./config";
import { demoTransactions } from "./demo";
import type { Transaction, TransactionDirection, TransactionSource } from "@/lib/types";

/**
 * The raw shape LOOP's transaction endpoints return. Sandbox responses vary in
 * field naming between endpoints, so every alias we've seen is accepted here
 * and collapsed by `normaliseTransaction` — that function is the only place in
 * Chroma that knows LOOP's field names.
 */
export interface RawLoopTransaction {
  transaction_id?: string;
  id?: string;
  reference?: string;
  amount?: number | string;
  currency?: string;
  /** "debit" | "credit" | "DR" | "CR" */
  type?: string;
  direction?: string;
  /** "till" | "paybill" | "transfer" | "checkout" | "request_to_pay" */
  channel?: string;
  source?: string;
  counterparty_name?: string;
  counterparty?: string;
  merchant_name?: string;
  narrative?: string;
  description?: string;
  timestamp?: string;
  created_at?: string;
  transaction_date?: string;
  account_reference?: string;
}

interface RawTransactionPage {
  data?: RawLoopTransaction[];
  transactions?: RawLoopTransaction[];
  results?: RawLoopTransaction[];
  next_cursor?: string;
  has_more?: boolean;
}

function pickSource(raw: RawLoopTransaction): TransactionSource {
  const v = (raw.channel ?? raw.source ?? "").toLowerCase();
  if (v.includes("till") || v.includes("buygoods")) return "till";
  if (v.includes("paybill") || v.includes("bill")) return "paybill";
  if (v.includes("checkout") || v.includes("pos")) return "checkout";
  if (v.includes("request")) return "request_to_pay";
  return "transfer";
}

function pickDirection(raw: RawLoopTransaction): TransactionDirection {
  const v = (raw.type ?? raw.direction ?? "").toLowerCase();
  if (v.startsWith("cr") || v.includes("credit") || v.includes("in")) return "credit";
  return "debit";
}

/** Minor units. Accepts "1,250.50" and 125050 alike; always returns a positive int. */
function pickAmount(raw: RawLoopTransaction): number {
  const v = raw.amount;
  if (typeof v === "number") return Math.abs(Math.round(v));
  const parsed = Number.parseFloat(String(v ?? "0").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  // A decimal point means the sandbox sent major units; scale to cents.
  const isMajor = String(v).includes(".");
  return Math.abs(Math.round(isMajor ? parsed * 100 : parsed));
}

export function normaliseTransaction(raw: RawLoopTransaction, userId: string): Transaction | null {
  const loopTransactionId = raw.transaction_id ?? raw.id ?? raw.reference;
  const timestamp = raw.timestamp ?? raw.created_at ?? raw.transaction_date;
  if (!loopTransactionId || !timestamp) return null;

  const when = new Date(timestamp);
  if (Number.isNaN(when.getTime())) return null;

  return {
    id: `txn_${userId}_${loopTransactionId}`,
    userId,
    loopTransactionId: String(loopTransactionId),
    amount: pickAmount(raw),
    currency: raw.currency ?? "KES",
    direction: pickDirection(raw),
    timestamp: when.toISOString(),
    counterparty: raw.counterparty_name ?? raw.counterparty ?? raw.merchant_name ?? "Unknown",
    source: pickSource(raw),
    description: raw.narrative ?? raw.description ?? "",
    reference: raw.reference,
    boardId: null,
  };
}

function pageItems(page: RawTransactionPage | RawLoopTransaction[]): RawLoopTransaction[] {
  if (Array.isArray(page)) return page;
  return page.data ?? page.transactions ?? page.results ?? [];
}

/**
 * Pulls transaction history for the connected account.
 * In demo mode this returns the seeded set — same raw shape, same normaliser.
 */
export async function fetchLoopTransactions(opts: {
  accessToken: string;
  accountRef: string;
  sinceDays?: number;
  maxPages?: number;
}): Promise<RawLoopTransaction[]> {
  const { accessToken, accountRef, sinceDays = 60, maxPages = 5 } = opts;

  if (isDemoMode()) return demoTransactions(accountRef, sinceDays);

  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const collected: RawLoopTransaction[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const res = await loopRequest<RawTransactionPage | RawLoopTransaction[]>("/transactions", {
      accessToken,
      query: { account_reference: accountRef, from: since, limit: 100, cursor },
    });

    const items = pageItems(res);
    collected.push(...items);

    const next = Array.isArray(res) ? undefined : res.next_cursor;
    if (!next || items.length === 0) break;
    cursor = next;
  }

  return collected;
}
