import "server-only";
import type { TransactionDirection, TransactionSource } from "@/lib/types";
import type { RawLoopTransaction } from "./transactions";

/**
 * Seeded sandbox fallback.
 *
 * The README calls for a demo mode so a rate-limited or unreachable sandbox
 * can't take the presentation down. This module emits data in the *same raw
 * shape* the LOOP endpoints return, so it enters the app through the identical
 * normaliser — demo mode exercises the real code path, it doesn't bypass it.
 *
 * The generator is seeded, so the same account always gets the same history.
 */

/** The sandbox tills LOOP documents; the demo defaults to the middle one. */
export const DEMO_TILLS = ["133238", "133239", "133240"] as const;

/** mulberry32 — small, fast, deterministic. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Merchant {
  name: string;
  source: TransactionSource;
  /** spend range in whole KES */
  min: number;
  max: number;
  /** rough draws per month */
  frequency: number;
  note: string;
  direction?: TransactionDirection;
}

const MERCHANTS: Merchant[] = [
  { name: "Kilimani Fresh Grocers", source: "till", min: 420, max: 3800, frequency: 9, note: "Groceries" },
  { name: "Riverside Fuel Stop", source: "till", min: 1500, max: 5000, frequency: 4, note: "Fuel" },
  { name: "Twiga Hardware Depot", source: "paybill", min: 2400, max: 26000, frequency: 3, note: "Site materials" },
  { name: "Mkokoteni Boda Transfer", source: "transfer", min: 120, max: 900, frequency: 12, note: "Transport" },
  { name: "Bright Power Prepaid", source: "paybill", min: 500, max: 2500, frequency: 2, note: "Electricity token" },
  { name: "Mwangaza Internet", source: "paybill", min: 2999, max: 2999, frequency: 1, note: "Monthly fibre" },
  { name: "Chai & Chapo Cafe", source: "till", min: 180, max: 1250, frequency: 8, note: "Lunch" },
  { name: "Ndovu Landlord Transfer", source: "transfer", min: 32000, max: 32000, frequency: 1, note: "Rent" },
  { name: "Sokoni Wholesale", source: "paybill", min: 6000, max: 42000, frequency: 2, note: "Stock restock" },
  { name: "Mama Njeri Stall", source: "till", min: 150, max: 700, frequency: 6, note: "Produce" },
  { name: "Kazi Casual Labour", source: "transfer", min: 800, max: 4500, frequency: 5, note: "Site labour" },
  { name: "Afya Pharmacy", source: "till", min: 350, max: 2800, frequency: 2, note: "Pharmacy" },
  { name: "Elimu Bookshop", source: "till", min: 400, max: 3200, frequency: 1, note: "Study materials" },
  { name: "Maji Safi Water", source: "paybill", min: 900, max: 2600, frequency: 1, note: "Water bill" },
  // Money in — customer payments landing through LOOP.
  { name: "Otieno J.", source: "request_to_pay", min: 3500, max: 18000, frequency: 4, note: "Invoice settled", direction: "credit" },
  { name: "Shop counter", source: "checkout", min: 600, max: 9500, frequency: 7, note: "Counter sale", direction: "credit" },
];

/**
 * Emits raw-shaped LOOP transactions for the last `days` days.
 * Amounts are minor units (cents), matching the sandbox convention.
 */
export function demoTransactions(accountRef: string, days = 60): RawLoopTransaction[] {
  // Seed from the account ref so a given demo account is stable across restarts.
  const seed = [...accountRef].reduce((acc, ch) => acc + ch.charCodeAt(0), 7919);
  const rand = seeded(seed);
  // Every emitted row carries a timestamp, so the sort below can rely on it.
  const out: (RawLoopTransaction & { timestamp: string })[] = [];
  const now = Date.now();
  const dayMs = 86_400_000;

  for (const m of MERCHANTS) {
    const draws = Math.max(1, Math.round((m.frequency * days) / 30));
    for (let i = 0; i < draws; i++) {
      // Spread across the window, jittered so it doesn't look like a grid.
      const dayOffset = Math.min(days - 1, Math.floor(((i + rand() * 0.9) / draws) * days));
      const at = now - dayOffset * dayMs - Math.floor(rand() * 11 * 3600_000) - Math.floor(rand() * 59) * 60_000;
      const whole = Math.round(m.min + rand() * (m.max - m.min));
      // Round to the nearest 10 KES the way real mobile-money amounts land.
      const rounded = Math.max(m.min, Math.round(whole / 10) * 10);

      out.push({
        transaction_id: `SBX${(seed + out.length * 977).toString(36).toUpperCase().padStart(8, "0")}`,
        amount: rounded * 100,
        currency: "KES",
        type: (m.direction ?? "debit") === "credit" ? "credit" : "debit",
        channel: m.source,
        counterparty_name: m.name,
        narrative: m.note,
        reference: `REF-${(1000 + Math.floor(rand() * 8999)).toString()}`,
        timestamp: new Date(at).toISOString(),
      });
    }
  }

  return out.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

/** A single fresh transaction, for demoing the live IPN tagging prompt. */
export function demoLiveTransaction(accountRef: string): RawLoopTransaction {
  const rand = seeded(Date.now() & 0xffff);
  const m = MERCHANTS[Math.floor(rand() * (MERCHANTS.length - 2))];
  const whole = Math.round(m.min + rand() * (m.max - m.min));
  return {
    transaction_id: `SBX-IPN-${Date.now().toString(36).toUpperCase()}`,
    amount: Math.max(m.min, Math.round(whole / 10) * 10) * 100,
    currency: "KES",
    type: "debit",
    channel: m.source,
    counterparty_name: m.name,
    narrative: m.note,
    reference: `REF-${Math.floor(rand() * 9999)}`,
    timestamp: new Date().toISOString(),
    account_reference: accountRef,
  };
}
