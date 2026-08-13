import type { Board, Insight, LoopTokenSet, StandingOrder, Transaction, User, UserType } from "@/lib/types";

/**
 * The storage contract.
 *
 * Two implementations satisfy it — a file-backed store for local development
 * and Postgres/Supabase for anything deployed. Every call site in the app goes
 * through `lib/db/store.ts`, which picks one, so nothing else in the codebase
 * knows or cares which is live.
 *
 * Everything is async so the two are interchangeable.
 */
export interface ChromaStore {
  readonly name: "memory" | "postgres";

  findUserByLoopRef(loopAccountRef: string): Promise<User | undefined>;
  getUser(userId: string): Promise<User | undefined>;
  upsertUserFromLoop(profile: {
    loopAccountRef: string;
    name: string;
    phoneNumber: string;
    userType: UserType;
  }): Promise<User>;

  saveTokens(userId: string, tokens: LoopTokenSet): Promise<void>;
  getTokens(userId: string): Promise<LoopTokenSet | null>;
  clearTokens(userId: string): Promise<void>;

  listBoards(userId: string): Promise<Board[]>;
  getBoard(userId: string, boardId: string): Promise<Board | undefined>;
  createBoard(input: {
    userId: string;
    name: string;
    colorCode: string;
    budgetAmount: number | null;
  }): Promise<Board>;
  updateBoard(
    userId: string,
    boardId: string,
    patch: Partial<Pick<Board, "name" | "colorCode" | "budgetAmount">>,
  ): Promise<Board | undefined>;
  deleteBoard(userId: string, boardId: string): Promise<boolean>;

  listTransactions(userId: string): Promise<Transaction[]>;
  upsertTransactions(incoming: Transaction[]): Promise<{ inserted: number; updated: number }>;
  tagTransaction(userId: string, transactionId: string, boardId: string | null): Promise<Transaction | undefined>;

  getLastSync(userId: string): Promise<string | null>;
  setLastSync(userId: string, at: string): Promise<void>;

  listInsights(userId: string): Promise<Insight[]>;
  replaceInsights(userId: string, insights: Omit<Insight, "id">[]): Promise<Insight[]>;

  listStandingOrders(userId: string): Promise<StandingOrder[]>;
  getStandingOrder(userId: string, orderId: string): Promise<StandingOrder | undefined>;
  createStandingOrder(input: Omit<StandingOrder, "id" | "createdAt" | "lastRunAt">): Promise<StandingOrder>;
  updateStandingOrder(
    userId: string,
    orderId: string,
    patch: Partial<Omit<StandingOrder, "id" | "userId" | "createdAt">>,
  ): Promise<StandingOrder | undefined>;
  deleteStandingOrder(userId: string, orderId: string): Promise<boolean>;
  /** Across every user — this is what the scheduled runner reads. */
  listDueStandingOrders(nowIso: string, limit: number): Promise<StandingOrder[]>;
}

/** Ids are generated app-side so both backends produce the same shape. */
export function newId(prefix: string, randomBytes: (n: number) => Buffer): string {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}
