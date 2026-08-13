import "server-only";
import crypto from "node:crypto";
import postgres from "postgres";
import { encryptJson, decryptJson } from "./crypto";
import type { ChromaStore } from "./backend";
import type {
  Board,
  Insight,
  InsightType,
  LoopTokenSet,
  StandingOrder,
  StandingOrderFrequency,
  StandingOrderKind,
  StandingOrderStatus,
  Transaction,
  TransactionDirection,
  TransactionSource,
  User,
  UserType,
} from "@/lib/types";

/**
 * Postgres / Supabase backend.
 *
 * Active whenever DATABASE_URL is set — which is what any deployment should
 * do, since serverless filesystems can't hold the file-backed store.
 *
 * Schema lives in lib/db/schema.sql. Apply it with `npm run db:push`, or paste
 * it into the Supabase SQL editor; this module never issues DDL at request
 * time, so a cold start is just a connection.
 */

const globalRef = globalThis as unknown as { __chromaSql?: postgres.Sql };

function client(): postgres.Sql {
  if (globalRef.__chromaSql) return globalRef.__chromaSql;

  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set, but the Postgres store was selected.");

  const sql = postgres(url, {
    // Supabase's pooler runs in transaction mode, where prepared statements
    // can't be reused across checkouts.
    prepare: false,
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require",
    // Serverless: many short-lived instances, so keep each one's pool small.
    max: 3,
    idle_timeout: 20,
    connect_timeout: 15,
  });

  globalRef.__chromaSql = sql;
  return sql;
}

export class SchemaMissingError extends Error {
  constructor() {
    super(
      "Chroma's tables don't exist yet in this database. Run `npm run db:push`, " +
        "or paste lib/db/schema.sql into the Supabase SQL editor.",
    );
    this.name = "SchemaMissingError";
  }
}

/** Turns "relation does not exist" into something a human can act on. */
async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "42P01") {
      throw new SchemaMissingError();
    }
    throw err;
  }
}

const id = (prefix: string) => `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
const iso = (value: Date | string): string => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());
/** int8 comes back as a string from the driver; amounts are cents, so Number is safe. */
const num = (value: unknown): number => Number(value ?? 0);

type Row = Record<string, unknown>;

function toUser(row: Row): User {
  return {
    id: String(row.id),
    name: String(row.name),
    phoneNumber: String(row.phone_number ?? ""),
    userType: String(row.user_type) as UserType,
    loopAccountRef: String(row.loop_account_ref),
    createdAt: iso(row.created_at as Date),
  };
}

function toBoard(row: Row): Board {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    colorCode: String(row.color_code),
    budgetAmount: row.budget_amount === null || row.budget_amount === undefined ? null : num(row.budget_amount),
    createdAt: iso(row.created_at as Date),
  };
}

function toTransaction(row: Row): Transaction {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    loopTransactionId: String(row.loop_transaction_id),
    amount: num(row.amount),
    currency: String(row.currency ?? "KES"),
    direction: String(row.direction) as TransactionDirection,
    timestamp: iso(row.occurred_at as Date),
    counterparty: String(row.counterparty ?? "Unknown"),
    source: String(row.source) as TransactionSource,
    description: String(row.description ?? ""),
    reference: row.reference === null || row.reference === undefined ? undefined : String(row.reference),
    boardId: row.board_id === null || row.board_id === undefined ? null : String(row.board_id),
    live: Boolean(row.live),
  };
}

function toStandingOrder(row: Row): StandingOrder {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    kind: String(row.kind) as StandingOrderKind,
    amount: num(row.amount),
    currency: String(row.currency ?? "KES"),
    frequency: String(row.frequency) as StandingOrderFrequency,
    destination: String(row.destination),
    reference: row.reference === null || row.reference === undefined ? null : String(row.reference),
    boardId: row.board_id === null || row.board_id === undefined ? null : String(row.board_id),
    status: String(row.status) as StandingOrderStatus,
    nextRunAt: iso(row.next_run_at as Date),
    lastRunAt: row.last_run_at ? iso(row.last_run_at as Date) : null,
    createdAt: iso(row.created_at as Date),
  };
}

function toInsight(row: Row): Insight {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    boardId: row.board_id === null || row.board_id === undefined ? null : String(row.board_id),
    message: String(row.message),
    generatedAt: iso(row.generated_at as Date),
    type: String(row.type) as InsightType,
    origin: row.origin === "ai" ? "ai" : "rules",
  };
}

export const postgresStore: ChromaStore = {
  name: "postgres",

  async findUserByLoopRef(loopAccountRef: string): Promise<User | undefined> {
    const sql = client();
    return guard(async () => {
      const rows = await sql<Row[]>`select * from chroma_users where loop_account_ref = ${loopAccountRef} limit 1`;
      return rows[0] ? toUser(rows[0]) : undefined;
    });
  },

  async getUser(userId: string): Promise<User | undefined> {
    const sql = client();
    return guard(async () => {
      const rows = await sql<Row[]>`select * from chroma_users where id = ${userId} limit 1`;
      return rows[0] ? toUser(rows[0]) : undefined;
    });
  },

  async upsertUserFromLoop(profile: {
    loopAccountRef: string;
    name: string;
    phoneNumber: string;
    userType: UserType;
  }): Promise<User> {
    const sql = client();
    return guard(async () => {
      // The LOOP account reference is the identity; a second authorisation by
      // the same account updates the row rather than creating a new user.
      const rows = await sql<Row[]>`
        insert into chroma_users (id, name, phone_number, user_type, loop_account_ref)
        values (${id("usr")}, ${profile.name}, ${profile.phoneNumber}, ${profile.userType}, ${profile.loopAccountRef})
        on conflict (loop_account_ref) do update set
          name = coalesce(nullif(excluded.name, ''), chroma_users.name),
          phone_number = coalesce(nullif(excluded.phone_number, ''), chroma_users.phone_number),
          user_type = excluded.user_type
        returning *`;
      return toUser(rows[0]);
    });
  },

  async saveTokens(userId: string, tokens: LoopTokenSet): Promise<void> {
    const sql = client();
    await guard(
      async () => sql`
        insert into chroma_loop_tokens (user_id, payload, updated_at)
        values (${userId}, ${encryptJson(tokens)}, now())
        on conflict (user_id) do update set payload = excluded.payload, updated_at = now()`,
    );
  },

  async getTokens(userId: string): Promise<LoopTokenSet | null> {
    const sql = client();
    return guard(async () => {
      const rows = await sql<Row[]>`select payload from chroma_loop_tokens where user_id = ${userId} limit 1`;
      return rows[0] ? decryptJson<LoopTokenSet>(String(rows[0].payload)) : null;
    });
  },

  async clearTokens(userId: string): Promise<void> {
    const sql = client();
    await guard(async () => sql`delete from chroma_loop_tokens where user_id = ${userId}`);
  },

  async listBoards(userId: string): Promise<Board[]> {
    const sql = client();
    return guard(async () => {
      const rows = await sql<Row[]>`select * from chroma_boards where user_id = ${userId} order by created_at asc`;
      return rows.map(toBoard);
    });
  },

  async getBoard(userId: string, boardId: string): Promise<Board | undefined> {
    const sql = client();
    return guard(async () => {
      const rows = await sql<Row[]>`select * from chroma_boards where id = ${boardId} and user_id = ${userId} limit 1`;
      return rows[0] ? toBoard(rows[0]) : undefined;
    });
  },

  async createBoard(input: {
    userId: string;
    name: string;
    colorCode: string;
    budgetAmount: number | null;
  }): Promise<Board> {
    const sql = client();
    return guard(async () => {
      const rows = await sql<Row[]>`
        insert into chroma_boards (id, user_id, name, color_code, budget_amount)
        values (${id("brd")}, ${input.userId}, ${input.name}, ${input.colorCode}, ${input.budgetAmount})
        returning *`;
      return toBoard(rows[0]);
    });
  },

  async updateBoard(
    userId: string,
    boardId: string,
    patch: Partial<Pick<Board, "name" | "colorCode" | "budgetAmount">>,
  ): Promise<Board | undefined> {
    const sql = client();
    return guard(async () => {
      // coalesce keeps untouched columns as they are; budget is explicitly
      // nullable, so it carries its own "was it provided" flag.
      const rows = await sql<Row[]>`
        update chroma_boards set
          name = coalesce(${patch.name ?? null}, name),
          color_code = coalesce(${patch.colorCode ?? null}, color_code),
          budget_amount = case when ${"budgetAmount" in patch} then ${patch.budgetAmount ?? null} else budget_amount end
        where id = ${boardId} and user_id = ${userId}
        returning *`;
      return rows[0] ? toBoard(rows[0]) : undefined;
    });
  },

  async deleteBoard(userId: string, boardId: string): Promise<boolean> {
    const sql = client();
    return guard(async () => {
      // Transactions are untagged by the FK (on delete set null), never deleted.
      const rows = await sql<Row[]>`delete from chroma_boards where id = ${boardId} and user_id = ${userId} returning id`;
      return rows.length > 0;
    });
  },

  async listTransactions(userId: string): Promise<Transaction[]> {
    const sql = client();
    return guard(async () => {
      const rows = await sql<Row[]>`
        select * from chroma_transactions where user_id = ${userId} order by occurred_at desc`;
      return rows.map(toTransaction);
    });
  },

  async upsertTransactions(incoming: Transaction[]): Promise<{ inserted: number; updated: number }> {
    if (incoming.length === 0) return { inserted: 0, updated: 0 };
    const sql = client();

    return guard(async () => {
      const values = incoming.map((t) => ({
        id: t.id,
        user_id: t.userId,
        loop_transaction_id: t.loopTransactionId,
        amount: t.amount,
        currency: t.currency,
        direction: t.direction,
        occurred_at: t.timestamp,
        counterparty: t.counterparty,
        source: t.source,
        description: t.description,
        reference: t.reference ?? null,
        board_id: t.boardId,
        live: t.live ?? false,
      }));

      // board_id and live are deliberately absent from the update list: a
      // re-sync refreshes LOOP's facts and leaves the user's filing alone.
      // xmax = 0 distinguishes a fresh insert from an update.
      // (No row-type generic here — it doesn't compose with the bulk-insert helper.)
      const rows = await sql`
        insert into chroma_transactions ${sql(
          values,
          "id",
          "user_id",
          "loop_transaction_id",
          "amount",
          "currency",
          "direction",
          "occurred_at",
          "counterparty",
          "source",
          "description",
          "reference",
          "board_id",
          "live",
        )}
        on conflict (id) do update set
          amount = excluded.amount,
          currency = excluded.currency,
          direction = excluded.direction,
          occurred_at = excluded.occurred_at,
          counterparty = excluded.counterparty,
          source = excluded.source,
          description = excluded.description,
          reference = excluded.reference
        returning (xmax = 0) as inserted`;

      const inserted = rows.filter((r) => r.inserted === true).length;
      return { inserted, updated: rows.length - inserted };
    });
  },

  async tagTransaction(userId: string, transactionId: string, boardId: string | null): Promise<Transaction | undefined> {
    const sql = client();
    return guard(async () => {
      // The exists() clause is the ownership check: you cannot file a
      // transaction into somebody else's Board.
      const rows = await sql<Row[]>`
        update chroma_transactions set board_id = ${boardId}, live = false
        where id = ${transactionId}
          and user_id = ${userId}
          and (
            ${boardId}::text is null
            or exists (select 1 from chroma_boards b where b.id = ${boardId} and b.user_id = ${userId})
          )
        returning *`;
      return rows[0] ? toTransaction(rows[0]) : undefined;
    });
  },

  async getLastSync(userId: string): Promise<string | null> {
    const sql = client();
    return guard(async () => {
      const rows = await sql<Row[]>`select last_sync from chroma_sync_state where user_id = ${userId} limit 1`;
      return rows[0] ? iso(rows[0].last_sync as Date) : null;
    });
  },

  async setLastSync(userId: string, at: string): Promise<void> {
    const sql = client();
    await guard(
      async () => sql`
        insert into chroma_sync_state (user_id, last_sync) values (${userId}, ${at})
        on conflict (user_id) do update set last_sync = excluded.last_sync`,
    );
  },

  async listInsights(userId: string): Promise<Insight[]> {
    const sql = client();
    return guard(async () => {
      const rows = await sql<Row[]>`
        select * from chroma_insights where user_id = ${userId} order by generated_at desc`;
      return rows.map(toInsight);
    });
  },

  async replaceInsights(userId: string, insights: Omit<Insight, "id">[]): Promise<Insight[]> {
    const sql = client();
    return guard(async () => {
      // One transaction, so a reader never sees the gap between the delete and
      // the insert.
      const saved = await sql.begin(async (tx) => {
        await tx`delete from chroma_insights where user_id = ${userId}`;
        if (insights.length === 0) return [];

        const values = insights.map((i) => ({
          id: id("ins"),
          user_id: i.userId,
          board_id: i.boardId,
          message: i.message,
          type: i.type,
          origin: i.origin,
          generated_at: i.generatedAt,
        }));

        const rows = await tx`
          insert into chroma_insights ${tx(values, "id", "user_id", "board_id", "message", "type", "origin", "generated_at")}
          returning *`;
        return rows.map((row) => toInsight(row as Row));
      });

      return saved as Insight[];
    });
  },

  async listStandingOrders(userId: string): Promise<StandingOrder[]> {
    const sql = client();
    return guard(async () => {
      const rows = await sql<Row[]>`
        select * from chroma_standing_orders where user_id = ${userId} order by next_run_at asc`;
      return rows.map(toStandingOrder);
    });
  },

  async getStandingOrder(userId: string, orderId: string): Promise<StandingOrder | undefined> {
    const sql = client();
    return guard(async () => {
      const rows = await sql<Row[]>`
        select * from chroma_standing_orders where id = ${orderId} and user_id = ${userId} limit 1`;
      return rows[0] ? toStandingOrder(rows[0]) : undefined;
    });
  },

  async createStandingOrder(input: Omit<StandingOrder, "id" | "createdAt" | "lastRunAt">): Promise<StandingOrder> {
    const sql = client();
    return guard(async () => {
      const rows = await sql<Row[]>`
        insert into chroma_standing_orders
          (id, user_id, name, kind, amount, currency, frequency, destination, reference, board_id, status, next_run_at)
        values (
          ${id("std")}, ${input.userId}, ${input.name}, ${input.kind}, ${input.amount}, ${input.currency},
          ${input.frequency}, ${input.destination}, ${input.reference}, ${input.boardId}, ${input.status},
          ${input.nextRunAt}
        )
        returning *`;
      return toStandingOrder(rows[0]);
    });
  },

  async updateStandingOrder(
    userId: string,
    orderId: string,
    patch: Partial<Omit<StandingOrder, "id" | "userId" | "createdAt">>,
  ): Promise<StandingOrder | undefined> {
    const sql = client();

    // Only the keys actually supplied are written, so a pause never rewrites
    // the schedule and a reschedule never flips the status.
    const columns: Record<string, unknown> = {};
    if (patch.name !== undefined) columns.name = patch.name;
    if (patch.kind !== undefined) columns.kind = patch.kind;
    if (patch.amount !== undefined) columns.amount = patch.amount;
    if (patch.currency !== undefined) columns.currency = patch.currency;
    if (patch.frequency !== undefined) columns.frequency = patch.frequency;
    if (patch.destination !== undefined) columns.destination = patch.destination;
    if (patch.reference !== undefined) columns.reference = patch.reference;
    if (patch.boardId !== undefined) columns.board_id = patch.boardId;
    if (patch.status !== undefined) columns.status = patch.status;
    if (patch.nextRunAt !== undefined) columns.next_run_at = patch.nextRunAt;
    if (patch.lastRunAt !== undefined) columns.last_run_at = patch.lastRunAt;

    if (Object.keys(columns).length === 0) return this.getStandingOrder(userId, orderId);

    return guard(async () => {
      const rows = await sql`
        update chroma_standing_orders set ${sql(columns)}
        where id = ${orderId} and user_id = ${userId}
        returning *`;
      return rows[0] ? toStandingOrder(rows[0] as Row) : undefined;
    });
  },

  async deleteStandingOrder(userId: string, orderId: string): Promise<boolean> {
    const sql = client();
    return guard(async () => {
      const rows = await sql<Row[]>`
        delete from chroma_standing_orders where id = ${orderId} and user_id = ${userId} returning id`;
      return rows.length > 0;
    });
  },

  async listDueStandingOrders(nowIso: string, limit: number): Promise<StandingOrder[]> {
    const sql = client();
    return guard(async () => {
      const rows = await sql<Row[]>`
        select * from chroma_standing_orders
        where status = 'active' and next_run_at <= ${nowIso}
        order by next_run_at asc
        limit ${limit}`;
      return rows.map(toStandingOrder);
    });
  },
};
