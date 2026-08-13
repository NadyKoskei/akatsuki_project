export type UserType = "student" | "business" | "individual";

/**
 * A Chroma user only ever exists because a LOOP account authorised us.
 * `loopAccountRef` is the LOOP-side account identifier; tokens live in
 * `LoopTokenSet` and are never mixed into anything sent to the browser.
 */
export interface User {
  id: string;
  name: string;
  phoneNumber: string;
  userType: UserType;
  loopAccountRef: string;
  createdAt: string;
}

export interface LoopTokenSet {
  accessToken: string;
  refreshToken?: string;
  /** epoch ms */
  expiresAt: number;
  scope?: string;
  tokenType: string;
}

export type TransactionSource = "till" | "paybill" | "transfer" | "checkout" | "request_to_pay";
export type TransactionDirection = "debit" | "credit";

/** Normalised shape. Whatever LOOP returns is mapped into this and nothing else. */
export interface Transaction {
  id: string;
  userId: string;
  loopTransactionId: string;
  /** Always positive; `direction` carries the sign. Minor units (cents). */
  amount: number;
  currency: string;
  direction: TransactionDirection;
  /** ISO 8601 */
  timestamp: string;
  counterparty: string;
  source: TransactionSource;
  description: string;
  reference?: string;
  boardId: string | null;
  /** true when it arrived over IPN rather than a history pull */
  live?: boolean;
}

export interface Board {
  id: string;
  userId: string;
  name: string;
  /** A slot key from BOARD_COLORS — never a raw hex, so light/dark stay correct. */
  colorCode: string;
  /** Minor units. null = no budget set. */
  budgetAmount: number | null;
  createdAt: string;
}

export type InsightType = "warning" | "trend" | "tip";

export interface Insight {
  id: string;
  userId: string;
  boardId: string | null;
  message: string;
  generatedAt: string;
  type: InsightType;
  /** "ai" when an LLM wrote it, "rules" when the deterministic engine did. */
  origin: "ai" | "rules";
}

/** Bills, savings and investments are the three things people commit to on a cadence. */
export type StandingOrderKind = "bill" | "savings" | "investment";
export type StandingOrderFrequency = "weekly" | "monthly";
export type StandingOrderStatus = "active" | "paused";

export interface StandingOrder {
  id: string;
  userId: string;
  name: string;
  kind: StandingOrderKind;
  /** Minor units, always positive. */
  amount: number;
  currency: string;
  frequency: StandingOrderFrequency;
  /** Where the money goes — a paybill, till, or account reference. */
  destination: string;
  reference: string | null;
  /** The Board the resulting transaction is filed to, if the user picked one. */
  boardId: string | null;
  status: StandingOrderStatus;
  /** ISO 8601. The runner picks up anything active and due. */
  nextRunAt: string;
  lastRunAt: string | null;
  createdAt: string;
}

export interface StandingOrderRunResult {
  orderId: string;
  name: string;
  status: "sent" | "skipped" | "failed";
  detail: string;
  transactionId?: string;
}

export interface BoardSummary {
  board: Board;
  spent: number;
  received: number;
  transactionCount: number;
  firstAt: string | null;
  lastAt: string | null;
  budgetUsedPct: number | null;
  budgetState: "none" | "ok" | "near" | "over";
}

export interface SessionUser {
  id: string;
  name: string;
  phoneNumber: string;
  userType: UserType;
  loopAccountRef: string;
  /** true when the session was minted against the seeded sandbox fallback */
  demo: boolean;
}
