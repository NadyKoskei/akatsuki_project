import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { encryptJson, decryptJson } from "./crypto";
import type { ChromaStore } from "./backend";
import type { Board, Insight, LoopTokenSet, StandingOrder, Transaction, User, UserType } from "@/lib/types";

/**
 * File-backed store for local development.
 *
 * One JSON document under ./.data, held in memory and flushed on write. It
 * carries `npm run dev` without a database server. It is deliberately NOT the
 * production path: serverless filesystems are ephemeral and per-instance, so
 * anything deployed should set DATABASE_URL and use the Postgres backend.
 *
 * Token sets are encrypted at rest; the rest is sandbox transaction data.
 */

interface StoreShape {
  version: 1;
  users: Record<string, User>;
  tokens: Record<string, string>;
  boards: Record<string, Board>;
  transactions: Record<string, Transaction>;
  insights: Record<string, Insight>;
  lastSync: Record<string, string>;
  standingOrders: Record<string, StandingOrder>;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "chroma.json");

function empty(): StoreShape {
  return {
    version: 1,
    users: {},
    tokens: {},
    boards: {},
    transactions: {},
    insights: {},
    lastSync: {},
    standingOrders: {},
  };
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
    // Read-only filesystem: keep serving from memory for this instance.
  }
}

/** Coalesce bursts of writes into one disk hit. */
function persist(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, 60);
  flushTimer.unref?.();
}

const id = (prefix: string) => `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;

export const memoryStore: ChromaStore = {
  name: "memory",

  async findUserByLoopRef(loopAccountRef: string): Promise<User | undefined> {
    return Object.values(load().users).find((u) => u.loopAccountRef === loopAccountRef);
  },

  async getUser(userId: string): Promise<User | undefined> {
    return load().users[userId];
  },

  async upsertUserFromLoop(profile: {
    loopAccountRef: string;
    name: string;
    phoneNumber: string;
    userType: UserType;
  }): Promise<User> {
    const db = load();
    const existing = Object.values(db.users).find((u) => u.loopAccountRef === profile.loopAccountRef);

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
  },

  async saveTokens(userId: string, tokens: LoopTokenSet): Promise<void> {
    load().tokens[userId] = encryptJson(tokens);
    persist();
  },

  async getTokens(userId: string): Promise<LoopTokenSet | null> {
    const raw = load().tokens[userId];
    return raw ? decryptJson<LoopTokenSet>(raw) : null;
  },

  async clearTokens(userId: string): Promise<void> {
    delete load().tokens[userId];
    persist();
  },

  async listBoards(userId: string): Promise<Board[]> {
    return Object.values(load().boards)
      .filter((b) => b.userId === userId)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  },

  async getBoard(userId: string, boardId: string): Promise<Board | undefined> {
    const board = load().boards[boardId];
    return board && board.userId === userId ? board : undefined;
  },

  async createBoard(input: {
    userId: string;
    name: string;
    colorCode: string;
    budgetAmount: number | null;
  }): Promise<Board> {
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
  },

  async updateBoard(
    userId: string,
    boardId: string,
    patch: Partial<Pick<Board, "name" | "colorCode" | "budgetAmount">>,
  ): Promise<Board | undefined> {
    const board = load().boards[boardId];
    if (!board || board.userId !== userId) return undefined;
    Object.assign(board, patch);
    persist();
    return board;
  },

  async deleteBoard(userId: string, boardId: string): Promise<boolean> {
    const db = load();
    const board = db.boards[boardId];
    if (!board || board.userId !== userId) return false;

    for (const txn of Object.values(db.transactions)) {
      if (txn.boardId === boardId) txn.boardId = null;
    }
    for (const [key, insight] of Object.entries(db.insights)) {
      if (insight.boardId === boardId) delete db.insights[key];
    }
    delete db.boards[boardId];
    persist();
    return true;
  },

  async listTransactions(userId: string): Promise<Transaction[]> {
    return Object.values(load().transactions)
      .filter((t) => t.userId === userId)
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  },

  async upsertTransactions(incoming: Transaction[]): Promise<{ inserted: number; updated: number }> {
    const db = load();
    let inserted = 0;
    let updated = 0;

    for (const txn of incoming) {
      const existing = db.transactions[txn.id];
      if (existing) {
        // A re-sync must never clobber a Board tag the user already applied.
        db.transactions[txn.id] = { ...txn, boardId: existing.boardId, live: existing.live };
        updated++;
      } else {
        db.transactions[txn.id] = txn;
        inserted++;
      }
    }

    if (inserted || updated) persist();
    return { inserted, updated };
  },

  async tagTransaction(userId: string, transactionId: string, boardId: string | null): Promise<Transaction | undefined> {
    const db = load();
    const txn = db.transactions[transactionId];
    if (!txn || txn.userId !== userId) return undefined;
    if (boardId) {
      const board = db.boards[boardId];
      if (!board || board.userId !== userId) return undefined;
    }

    txn.boardId = boardId;
    txn.live = false; // filed, so it leaves the "needs attention" queue
    persist();
    return txn;
  },

  async getLastSync(userId: string): Promise<string | null> {
    return load().lastSync[userId] ?? null;
  },

  async setLastSync(userId: string, at: string): Promise<void> {
    load().lastSync[userId] = at;
    persist();
  },

  async listInsights(userId: string): Promise<Insight[]> {
    return Object.values(load().insights)
      .filter((i) => i.userId === userId)
      .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));
  },

  async replaceInsights(userId: string, insights: Omit<Insight, "id">[]): Promise<Insight[]> {
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
  },

  async listStandingOrders(userId: string): Promise<StandingOrder[]> {
    return Object.values(load().standingOrders)
      .filter((o) => o.userId === userId)
      .sort((a, b) => Date.parse(a.nextRunAt) - Date.parse(b.nextRunAt));
  },

  async getStandingOrder(userId: string, orderId: string): Promise<StandingOrder | undefined> {
    const order = load().standingOrders[orderId];
    return order && order.userId === userId ? order : undefined;
  },

  async createStandingOrder(input: Omit<StandingOrder, "id" | "createdAt" | "lastRunAt">): Promise<StandingOrder> {
    const order: StandingOrder = {
      ...input,
      id: id("std"),
      lastRunAt: null,
      createdAt: new Date().toISOString(),
    };
    load().standingOrders[order.id] = order;
    persist();
    return order;
  },

  async updateStandingOrder(
    userId: string,
    orderId: string,
    patch: Partial<Omit<StandingOrder, "id" | "userId" | "createdAt">>,
  ): Promise<StandingOrder | undefined> {
    const order = load().standingOrders[orderId];
    if (!order || order.userId !== userId) return undefined;
    Object.assign(order, patch);
    persist();
    return order;
  },

  async deleteStandingOrder(userId: string, orderId: string): Promise<boolean> {
    const db = load();
    const order = db.standingOrders[orderId];
    if (!order || order.userId !== userId) return false;
    delete db.standingOrders[orderId];
    persist();
    return true;
  },

  async listDueStandingOrders(nowIso: string, limit: number): Promise<StandingOrder[]> {
    const now = Date.parse(nowIso);
    return Object.values(load().standingOrders)
      .filter((o) => o.status === "active" && Date.parse(o.nextRunAt) <= now)
      .sort((a, b) => Date.parse(a.nextRunAt) - Date.parse(b.nextRunAt))
      .slice(0, limit);
  },
};
