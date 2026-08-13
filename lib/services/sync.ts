import "server-only";
import { fetchLoopTransactions, normaliseTransaction } from "@/lib/loop/transactions";
import { isDemoMode } from "@/lib/loop/config";
import { BOARD_COLORS } from "@/lib/palette";
import {
  createBoard,
  listBoards,
  listTransactions,
  setLastSync,
  tagTransaction,
  upsertTransactions,
} from "@/lib/db/store";
import type { Board, Transaction, UserType } from "@/lib/types";

export interface SyncResult {
  inserted: number;
  updated: number;
  total: number;
  syncedAt: string;
}

/**
 * Pulls history from LOOP and upserts it. Existing Board tags survive a
 * re-sync — LOOP owns the transaction, the user owns the tag.
 */
export async function syncFromLoop(opts: {
  userId: string;
  accountRef: string;
  accessToken: string;
  sinceDays?: number;
}): Promise<SyncResult> {
  const raw = await fetchLoopTransactions({
    accessToken: opts.accessToken,
    accountRef: opts.accountRef,
    sinceDays: opts.sinceDays ?? 60,
  });

  const normalised = raw
    .map((r) => normaliseTransaction(r, opts.userId))
    .filter((t): t is Transaction => t !== null);

  const { inserted, updated } = await upsertTransactions(normalised);
  const syncedAt = new Date().toISOString();
  await setLastSync(opts.userId, syncedAt);

  return { inserted, updated, total: normalised.length, syncedAt };
}

/** Starter Boards, so a brand-new account has somewhere to file its first transaction. */
const STARTERS: Record<UserType, { name: string; budget: number | null }[]> = {
  business: [
    { name: "Stock & Supplies", budget: 60_000_00 },
    { name: "Site Costs", budget: 45_000_00 },
    { name: "Sales In", budget: null },
    { name: "Personal", budget: 25_000_00 },
  ],
  student: [
    { name: "Food", budget: 12_000_00 },
    { name: "Transport", budget: 6_000_00 },
    { name: "Study Materials", budget: 5_000_00 },
    { name: "Rent", budget: 18_000_00 },
  ],
  individual: [
    { name: "Household", budget: 30_000_00 },
    { name: "Transport", budget: 8_000_00 },
    { name: "Rent", budget: 32_000_00 },
    { name: "Personal", budget: 15_000_00 },
  ],
};

export async function seedStarterBoards(userId: string, userType: UserType): Promise<Board[]> {
  const existing = await listBoards(userId);
  if (existing.length > 0) return existing;

  const created: Board[] = [];
  for (const [i, starter] of STARTERS[userType].entries()) {
    created.push(
      await createBoard({
        userId,
        name: starter.name,
        colorCode: BOARD_COLORS[i % BOARD_COLORS.length].key,
        budgetAmount: starter.budget,
      }),
    );
  }
  return created;
}

/**
 * Demo-only: files most of the seeded history against the starter Boards so the
 * dashboard has something to show on first load, and deliberately leaves the
 * newest few untagged to exercise the "which Board is this for?" prompt.
 *
 * Never runs against live LOOP data — a real account's tags are the user's.
 */
const DEMO_FILING: Record<string, string[]> = {
  "Stock & Supplies": ["Sokoni Wholesale", "Twiga Hardware Depot", "Kilimani Fresh Grocers"],
  "Site Costs": ["Kazi Casual Labour", "Riverside Fuel Stop", "Mkokoteni Boda Transfer"],
  "Sales In": ["Otieno J.", "Shop counter"],
  Personal: ["Chai & Chapo Cafe", "Afya Pharmacy", "Mama Njeri Stall", "Elimu Bookshop"],
  Household: ["Kilimani Fresh Grocers", "Bright Power Prepaid", "Maji Safi Water", "Mwangaza Internet"],
  Transport: ["Mkokoteni Boda Transfer", "Riverside Fuel Stop"],
  Rent: ["Ndovu Landlord Transfer"],
  Food: ["Chai & Chapo Cafe", "Mama Njeri Stall", "Kilimani Fresh Grocers"],
  "Study Materials": ["Elimu Bookshop"],
};

export async function autoFileDemoTransactions(userId: string, leaveUntagged = 6): Promise<number> {
  if (!isDemoMode()) return 0;

  const boards = await listBoards(userId);
  const byCounterparty = new Map<string, string>();
  for (const board of boards) {
    for (const counterparty of DEMO_FILING[board.name] ?? []) {
      if (!byCounterparty.has(counterparty)) byCounterparty.set(counterparty, board.id);
    }
  }

  // Newest first — skip the freshest few so the tagging queue isn't empty.
  const transactions = await listTransactions(userId);
  let filed = 0;

  for (const txn of transactions.slice(leaveUntagged)) {
    if (txn.boardId) continue;
    const boardId = byCounterparty.get(txn.counterparty);
    if (!boardId) continue;
    await tagTransaction(userId, txn.id, boardId);
    filed++;
  }

  return filed;
}
