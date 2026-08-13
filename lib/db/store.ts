import "server-only";
import type { ChromaStore } from "./backend";
import { memoryStore } from "./memory-store";
import { postgresStore } from "./postgres-store";

/**
 * Storage entry point. Every part of the app imports from here and stays
 * ignorant of which backend is live.
 *
 *   DATABASE_URL set    -> Postgres / Supabase   (use this for anything deployed)
 *   DATABASE_URL unset  -> file-backed store     (fine for `npm run dev`)
 *
 * The choice is made once per process, at first use.
 */

function usePostgres(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  return Boolean(url && !/^your_/i.test(url));
}

let selected: ChromaStore | null = null;

function backend(): ChromaStore {
  if (!selected) selected = usePostgres() ? postgresStore : memoryStore;
  return selected;
}

/** Which backend is live — surfaced in the dashboard footer, and handy in logs. */
export function storeName(): ChromaStore["name"] {
  return backend().name;
}

/* ── Users ──────────────────────────────────────────────────────────────── */

export const findUserByLoopRef: ChromaStore["findUserByLoopRef"] = (ref) => backend().findUserByLoopRef(ref);
export const getUser: ChromaStore["getUser"] = (userId) => backend().getUser(userId);

/** The only way a Chroma user comes into existence — called from the LOOP callback. */
export const upsertUserFromLoop: ChromaStore["upsertUserFromLoop"] = (profile) => backend().upsertUserFromLoop(profile);

/* ── LOOP tokens (encrypted before they reach either backend) ───────────── */

export const saveTokens: ChromaStore["saveTokens"] = (userId, tokens) => backend().saveTokens(userId, tokens);
export const getTokens: ChromaStore["getTokens"] = (userId) => backend().getTokens(userId);
export const clearTokens: ChromaStore["clearTokens"] = (userId) => backend().clearTokens(userId);

/* ── Boards ─────────────────────────────────────────────────────────────── */

export const listBoards: ChromaStore["listBoards"] = (userId) => backend().listBoards(userId);
export const getBoard: ChromaStore["getBoard"] = (userId, boardId) => backend().getBoard(userId, boardId);
export const createBoard: ChromaStore["createBoard"] = (input) => backend().createBoard(input);
export const updateBoard: ChromaStore["updateBoard"] = (userId, boardId, patch) =>
  backend().updateBoard(userId, boardId, patch);
export const deleteBoard: ChromaStore["deleteBoard"] = (userId, boardId) => backend().deleteBoard(userId, boardId);

/* ── Transactions ───────────────────────────────────────────────────────── */

export const listTransactions: ChromaStore["listTransactions"] = (userId) => backend().listTransactions(userId);
export const upsertTransactions: ChromaStore["upsertTransactions"] = (incoming) => backend().upsertTransactions(incoming);
export const tagTransaction: ChromaStore["tagTransaction"] = (userId, txnId, boardId) =>
  backend().tagTransaction(userId, txnId, boardId);
export const getLastSync: ChromaStore["getLastSync"] = (userId) => backend().getLastSync(userId);
export const setLastSync: ChromaStore["setLastSync"] = (userId, at) => backend().setLastSync(userId, at);

/* ── Insights ───────────────────────────────────────────────────────────── */

export const listInsights: ChromaStore["listInsights"] = (userId) => backend().listInsights(userId);
export const replaceInsights: ChromaStore["replaceInsights"] = (userId, insights) =>
  backend().replaceInsights(userId, insights);

/* ── Standing orders ────────────────────────────────────────────────────── */

export const listStandingOrders: ChromaStore["listStandingOrders"] = (userId) => backend().listStandingOrders(userId);
export const getStandingOrder: ChromaStore["getStandingOrder"] = (userId, orderId) =>
  backend().getStandingOrder(userId, orderId);
export const createStandingOrder: ChromaStore["createStandingOrder"] = (input) => backend().createStandingOrder(input);
export const updateStandingOrder: ChromaStore["updateStandingOrder"] = (userId, orderId, patch) =>
  backend().updateStandingOrder(userId, orderId, patch);
export const deleteStandingOrder: ChromaStore["deleteStandingOrder"] = (userId, orderId) =>
  backend().deleteStandingOrder(userId, orderId);
export const listDueStandingOrders: ChromaStore["listDueStandingOrders"] = (nowIso, limit) =>
  backend().listDueStandingOrders(nowIso, limit);
