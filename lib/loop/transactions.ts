import "server-only";
import { loopConfig, isDemoMode } from "./config";
import { LoopApiError } from "./client";
import { getAccessToken, loopNonce, loopTimestamp, loopTxnReference, signRequest } from "./auth";
import { demoTransactions } from "./demo";
import type { Transaction, TransactionDirection, TransactionSource } from "@/lib/types";

/**
 * Merchant transaction history.
 *
 * POST to the history API with a Bearer token and a signed body. Two things
 * about this endpoint are easy to get wrong and both are enforced by LOOP:
 * the envelope reference must be unique per call (a repeat is refused as a
 * duplicate), and the outcome lives in the body's statusCode — the HTTP status
 * is 200 even for failures, so branching on HTTP alone reads errors as success.
 */

export interface LoopHistoryItem {
  txnReference?: string;
  transactionRef?: string;
  status?: string;
  resultCode?: string;
  resultDesc?: string;
  finalState?: boolean;
  /** Major units as a string, e.g. "1200" = KES 1,200. */
  amount?: string | number;
  currency?: string;
  tillNo?: string;
  /** The paying customer's number. */
  msisdn?: string;
  /** "2026-08-12 11:42:08" — no zone marker; read as UTC. */
  initiatedAt?: string;
  lastUpdatedAt?: string;
  retryCount?: number;
}

interface HistoryEnvelope {
  statusCode?: number;
  message?: string;
  data?: {
    serviceTransactionStatus?: string;
    requestReference?: string;
    txnReference?: string;
    response?: {
      rspMessage?: string;
      count?: number;
      limit?: number;
      transactionRef?: string;
      tillNo?: string;
      transactions?: LoopHistoryItem[];
    };
  };
}

export interface TillCredentials {
  merchantTill: string;
  tillSecret: string;
}

/** Raw shape kept for the demo dataset and the IPN handler. */
export interface RawLoopTransaction {
  transaction_id?: string;
  id?: string;
  reference?: string;
  amount?: number | string;
  currency?: string;
  type?: string;
  direction?: string;
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

/* ── The live call ──────────────────────────────────────────────────────── */

export async function fetchTillHistory(
  credentials: TillCredentials,
  limit = 100,
): Promise<{ items: LoopHistoryItem[]; message: string }> {
  const token = await getAccessToken();
  const timestamp = loopTimestamp();
  const nonce = loopNonce();

  const body = {
    serviceCode: "MRCHNT_TXN_HISTORY",
    // Unique per call — LOOP rejects a repeat as a duplicate.
    txnReference: loopTxnReference(),
    requestParameters: {
      merchantTill: credentials.merchantTill,
      // A JSON number, not a string, and not part of the signed string.
      limit,
      timestamp,
      nonce,
      signature: signRequest(credentials.merchantTill, timestamp, nonce, credentials.tillSecret),
    },
  };

  const res = await fetch(loopConfig.historyUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let envelope: HistoryEnvelope;
  try {
    envelope = JSON.parse(text) as HistoryEnvelope;
  } catch {
    throw new LoopApiError("transaction-history", res.status, text.slice(0, 400));
  }

  // The body's statusCode is authoritative; HTTP is 200 even on failure.
  const status = envelope.statusCode ?? res.status;
  if (status !== 200) {
    throw new LoopApiError("transaction-history", status, envelope.message ?? text.slice(0, 400));
  }

  return {
    items: envelope.data?.response?.transactions ?? [],
    message: envelope.message ?? "ok",
  };
}

/** A cheap signed call that proves the caller holds this till's secret. */
export async function verifyTill(credentials: TillCredentials): Promise<boolean> {
  if (isDemoMode()) return true;
  await fetchTillHistory(credentials, 1);
  return true;
}

/* ── Normalisation ──────────────────────────────────────────────────────── */

/** "2026-08-12 11:42:08" has no zone marker; read it as UTC. */
function parseLoopDate(value: string | undefined): string | null {
  if (!value) return null;
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** LOOP sends major units as a string; Chroma stores minor units. */
function toMinorUnits(amount: string | number | undefined): number {
  const parsed = typeof amount === "number" ? amount : Number.parseFloat(String(amount ?? "0").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

/**
 * A till receives money, so history items are payments *in* from customers.
 * Money out comes from the payment APIs (standing orders) and shows as debits.
 */
export function normaliseHistoryItem(item: LoopHistoryItem, userId: string): Transaction | null {
  const reference = item.txnReference ?? item.transactionRef;
  const timestamp = parseLoopDate(item.initiatedAt ?? item.lastUpdatedAt);
  if (!reference || !timestamp) return null;

  // A failed payment never moved money; importing it would misstate every total.
  if ((item.status ?? "").toUpperCase() === "FAILED") return null;

  return {
    id: `txn_${userId}_${reference}`,
    userId,
    loopTransactionId: String(reference),
    amount: toMinorUnits(item.amount),
    currency: item.currency ?? "KES",
    direction: "credit",
    timestamp,
    counterparty: item.msisdn ? maskMsisdn(item.msisdn) : `Till ${item.tillNo ?? ""}`.trim(),
    source: "till",
    description: item.resultDesc ?? item.status ?? "",
    reference: String(reference),
    boardId: null,
  };
}

/** Customer numbers are personal data; keep only enough to tell payers apart. */
function maskMsisdn(msisdn: string): string {
  const digits = msisdn.replace(/\D/g, "");
  return digits.length <= 4 ? msisdn : `${digits.slice(0, 6)}•••${digits.slice(-3)}`;
}

/* ── Demo-mode path (unchanged shape, same normaliser downstream) ───────── */

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

function pickAmount(raw: RawLoopTransaction): number {
  const v = raw.amount;
  if (typeof v === "number") return Math.abs(Math.round(v));
  const parsed = Number.parseFloat(String(v ?? "0").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(parsed)) return 0;
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

/**
 * Pulls history for a till, or the seeded set when running in demo mode.
 * Returns Chroma-shaped transactions either way.
 */
export async function fetchLoopTransactions(opts: {
  credentials: TillCredentials;
  userId: string;
  limit?: number;
  sinceDays?: number;
}): Promise<Transaction[]> {
  if (isDemoMode()) {
    return demoTransactions(opts.credentials.merchantTill, opts.sinceDays ?? 60)
      .map((raw) => normaliseTransaction(raw, opts.userId))
      .filter((t): t is Transaction => t !== null);
  }

  const { items } = await fetchTillHistory(opts.credentials, opts.limit ?? 100);
  return items.map((item) => normaliseHistoryItem(item, opts.userId)).filter((t): t is Transaction => t !== null);
}
