import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { encryptJson, decryptJson } from "./crypto";
import type { Board, Insight, LoopTokenSet, Transaction, User, UserType } from "@/lib/types";

/**
 * File-backed store.
 *
 * Deliberately small: one JSON document under ./.data, held in memory and
 * flushed on write. It carries the hackathon build without a database server,
 * and every call site goes through the functions below — so swapping in
 * Postgres means reimplementing this module's exports, nothing else.
 *
 * Token sets are encrypted at rest; the rest is sandbox transaction data.
 */

interface StoreShape {
  version: 1;
  users: Record<string, User>;
  /** userId -> encrypted LoopTokenSet */
  tokens: Record<string, string>;
  boards: Record<string, Board>;
  transactions: Record<string, Transaction>;
  insights: Record<string, Insight>;
  /** userId -> ISO timestamp of the last successful LOOP pull */
  lastSync: Record<string, string>;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "chroma.json");

function empty(): StoreShape {
  return { version: 1, users: {}, tokens: {}, boards: {}, transactions: {}, insights: {}, lastSync: {} };
}

// Survive dev-server hot reloads, which re-evaluate modules.
const globalRef = globalThis as unknown as { __chromaStore?: StoreShape };

function load(): StoreShape {
  if (globalRef.__chromaStore) return globalRef.__chromaStore;

  let data = empty();
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as Partial<StoreShape>;
      data = { ...empty(), ...parsed, version: 1 };
    }
  } catch {
    // Corrupt file: start clean rather than crash the app. Sandbox data only.
    data = empty();
  }

  globalRef.__chromaStore = data;
  return data;
}

let flushTimer: NodeJS.Timeout | null = null;

function flush(): void {
  const data = load();
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${DATA_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, DATA_FILE);
  } catch {
    // Read-only filesystem (some hosts): keep serving from memory.
  }
}

/** Coalesce bursts of writes into one disk hit. */
function persist(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, 60);
  // Don't hold the process open for a pending flush.
  flushTimer.unref?.();
}

const id = (prefix: string) => `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;

/* ── Users ──────────────────────────────────────────────────────────────── */

export function findUserByLoopRef(loopAccountRef: string): User | undefined {
  return Object.values(load().users).find((u) => u.loopAccountRef === loopAccountRef);
}

export function getUser(userId: string): User | undefined {
  return load().users[userId];
}

/**
 * The only way a User row comes into existence. Called from the LOOP callback
 * after a verified authorisation — there is no other creation path.
 */
export function upsertUserFromLoop(profile: {
  loopAccountRef: string;
  name: string;
  phoneNumber: string;
  userType: UserType;
}): User {
  const db = load();
  const existing = findUserByLoopRef(profile.loopAccountRef);

  if (existing) {
    existing.name = profile.name || existing.name;
    existing.phoneNumber = profile.phoneNumber || existing.phoneNumber;
    existing.userType = profile.userType;
    persist();
    return existing;
  }

  const user: User = {
    id: id("usr"),
    name: profile.name,
    phoneNumber: profile.phoneNumber,
    userType: profile.userType,
    loopAccountRef: profile.loopAccountRef,
    createdAt: new Date().toISOString(),
  };
  db.users[user.id] = user;
  persist();
  return user;
}

/* ── LOOP tokens (encrypted at rest) ────────────────────────────────────── */

export function saveTokens(userId: string, tokens: LoopTokenSet): void {
  load().tokens[userId] = encryptJson(tokens);
  persist();
}

export function getTokens(userId: string): LoopTokenSet | null {
  const raw = load().tokens[userId];
  return raw ? decryptJson<LoopTokenSet>(raw) : null;
}

export function clearTokens(userId: string): void {
  delete load().tokens[userId];
  persist();
}

/* ── Boards ─────────────────────────────────────────────────────────────── */

export function listBoards(userId: string): Board[] {
  return Object.values(load().boards)
    .filter((b) => b.userId === userId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export function getBoard(userId: string, boardId: string): Board | undefined {
  const board = load().boards[boardId];
  return board && board.userId === userId ? board : undefined;
}

export function createBoard(input: {
  userId: string;
  name: string;
  colorCode: string;
  budgetAmount: number | null;
}): Board {
  const board: Board = {
    id: id("brd"),
    userId: input.userId,
    name: input.name,
    colorCode: input.colorCode,
    budgetAmount: input.budgetAmount,
    createdAt: new Date().toISOString(),
  };
  load().boards[board.id] = board;
  persist();
  return board;
}

export function updateBoard(
  userId: string,
  boardId: string,
  patch: Partial<Pick<Board, "name" | "colorCode" | "budgetAmount">>,
): Board | undefined {
  const board = getBoard(userId, boardId);
  if (!board) return undefined;
  Object.assign(board, patch);
  persist();
  return board;
}

/** Deleting a Board untags its transactions rather than deleting LOOP data. */
export function deleteBoard(userId: string, boardId: string): boolean {
  const db = load();
  const board = getBoard(userId, boardId);
  if (!board) return false;

  for (const txn of Object.values(db.transactions)) {
    if (txn.boardId === boardId) txn.boardId = null;
  }
  for (const [key, insight] of Object.entries(db.insights)) {
    if (insight.boardId === boardId) delete db.insights[key];
  }
  delete db.boards[boardId];
  persist();
  return true;
}

/* ── Transactions ───────────────────────────────────────────────────────── */

export function listTransactions(userId: string): Transaction[] {
  return Object.values(load().transactions)
    .filter((t) => t.userId === userId)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

/**
 * Upserts pulled transactions, keyed by LOOP's transaction id, so re-syncing
 * never duplicates and never clobbers a Board tag the user already applied.
 */
export function upsertTransactions(incoming: Transaction[]): { inserted: number; updated: number } {
  const db = load();
  let inserted = 0;
  let updated = 0;

  for (const txn of incoming) {
    const existing = db.transactions[txn.id];
    if (existing) {
      db.transactions[txn.id] = { ...txn, boardId: existing.boardId, live: existing.live };
      updated++;
    } else {
      db.transactions[txn.id] = txn;
      inserted++;
    }
  }

  if (inserted || updated) persist();
  return { inserted, updated };
}

export function tagTransaction(userId: string, transactionId: string, boardId: string | null): Transaction | undefined {
  const db = load();
  const txn = db.transactions[transactionId];
  if (!txn || txn.userId !== userId) return undefined;
  if (boardId && !getBoard(userId, boardId)) return undefined;

  txn.boardId = boardId;
  txn.live = false; // tagged, so it leaves the "needs attention" queue
  persist();
  return txn;
}

export function getLastSync(userId: string): string | null {
  return load().lastSync[userId] ?? null;
}

export function setLastSync(userId: string, at: string): void {
  load().lastSync[userId] = at;
  persist();
}

/* ── Insights ───────────────────────────────────────────────────────────── */

export function listInsights(userId: string): Insight[] {
  return Object.values(load().insights)
    .filter((i) => i.userId === userId)
    .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));
}

export function replaceInsights(userId: string, insights: Omit<Insight, "id">[]): Insight[] {
  const db = load();
  for (const [key, insight] of Object.entries(db.insights)) {
    if (insight.userId === userId) delete db.insights[key];
  }

  const saved = insights.map((i) => {
    const withId: Insight = { ...i, id: id("ins") };
    db.insights[withId.id] = withId;
    return withId;
  });

  persist();
  return saved;
}

/** Wipes a user's Chroma-side data. LOOP is untouched. */
export function resetUserData(userId: string): void {
  const db = load();
  for (const [key, t] of Object.entries(db.transactions)) if (t.userId === userId) delete db.transactions[key];
  for (const [key, b] of Object.entries(db.boards)) if (b.userId === userId) delete db.boards[key];
  for (const [key, i] of Object.entries(db.insights)) if (i.userId === userId) delete db.insights[key];
  delete db.lastSync[userId];
  persist();
}
