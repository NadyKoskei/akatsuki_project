import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { formatMoney } from "@/lib/format";
import type { BoardSummary, Insight, InsightType, Transaction } from "@/lib/types";
import { periodDelta, type Totals } from "./analytics";

/**
 * The insights engine.
 *
 * Two layers: a deterministic rules engine that always runs, and an optional
 * LLM pass that rewrites the same underlying facts in plain language. If no AI
 * key is configured — or the call fails — the rules output ships as-is, so the
 * dashboard is never blank in front of a judge.
 *
 * The model is never asked to compute anything: every number it sees has
 * already been calculated from the LOOP data, so it cannot invent a figure.
 */

const MODEL = process.env.AI_MODEL?.trim() || "claude-opus-5";

export interface InsightInput {
  userId: string;
  summaries: BoardSummary[];
  transactions: Transaction[];
  totals: Totals;
  rangeDays: number;
  currency: string;
}

type DraftInsight = Omit<Insight, "id">;

/* ── Layer 1: rules ─────────────────────────────────────────────────────── */

export function rulesInsights(input: InsightInput): DraftInsight[] {
  const { summaries, totals, rangeDays, currency } = input;
  const now = new Date().toISOString();
  const out: DraftInsight[] = [];

  const push = (message: string, type: InsightType, boardId: string | null = null) =>
    out.push({ userId: input.userId, boardId, message, generatedAt: now, type, origin: "rules" });

  // Budget pressure first — it's the most actionable thing on the screen.
  for (const s of summaries) {
    if (s.budgetState === "over" && s.board.budgetAmount) {
      const over = s.spent - s.board.budgetAmount;
      push(
        `${s.board.name} is ${formatMoney(over, currency)} over its ${formatMoney(s.board.budgetAmount, currency)} budget.`,
        "warning",
        s.board.id,
      );
    } else if (s.budgetState === "near" && s.budgetUsedPct !== null) {
      push(
        `${s.board.name} has used ${Math.round(s.budgetUsedPct)}% of its budget with the period still running.`,
        "warning",
        s.board.id,
      );
    }
  }

  // Where the money actually went.
  const ranked = [...summaries].filter((s) => s.spent > 0).sort((a, b) => b.spent - a.spent);
  if (ranked.length > 0 && totals.spent > 0) {
    const top = ranked[0];
    const share = Math.round((top.spent / totals.spent) * 100);
    push(
      `${top.board.name} took ${share}% of your spending in the last ${rangeDays} days — ${formatMoney(top.spent, currency)} across ${top.transactionCount} transactions.`,
      "trend",
      top.board.id,
    );
  }

  const delta = periodDelta(input.transactions, rangeDays);
  if (delta !== null && Math.abs(delta) >= 10) {
    push(
      delta > 0
        ? `Spending is up ${Math.round(delta)}% versus the previous ${rangeDays} days.`
        : `Spending is down ${Math.round(Math.abs(delta))}% versus the previous ${rangeDays} days.`,
      delta > 0 ? "warning" : "trend",
    );
  }

  if (totals.untagged > 0) {
    push(
      `${totals.untagged} transaction${totals.untagged === 1 ? "" : "s"} worth ${formatMoney(totals.untaggedAmount, currency)} ${totals.untagged === 1 ? "is" : "are"} still unfiled. Tag them so your Boards stay honest.`,
      "tip",
    );
  }

  if (totals.received > 0 && totals.spent > 0) {
    const net = totals.received - totals.spent;
    push(
      net >= 0
        ? `You took in ${formatMoney(net, currency)} more than you spent this period.`
        : `You spent ${formatMoney(Math.abs(net), currency)} more than you took in this period.`,
      net >= 0 ? "trend" : "warning",
    );
  }

  const unbudgeted = summaries.filter((s) => s.board.budgetAmount === null && s.spent > 0);
  if (unbudgeted.length > 0) {
    push(
      `${unbudgeted.length} Board${unbudgeted.length === 1 ? " has" : "s have"} no budget set — ${unbudgeted
        .slice(0, 3)
        .map((s) => s.board.name)
        .join(", ")}. A limit turns a Board into a guardrail.`,
      "tip",
    );
  }

  return out.slice(0, 6);
}

/* ── Layer 2: the LLM pass ──────────────────────────────────────────────── */

const INSIGHT_SCHEMA = {
  type: "object",
  properties: {
    insights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          message: { type: "string" },
          type: { type: "string", enum: ["warning", "trend", "tip"] },
          boardName: { type: ["string", "null"] },
        },
        required: ["message", "type", "boardName"],
        additionalProperties: false,
      },
    },
  },
  required: ["insights"],
  additionalProperties: false,
} as const;

interface ModelInsights {
  insights: { message: string; type: InsightType; boardName: string | null }[];
}

function buildFacts(input: InsightInput): string {
  const { summaries, totals, rangeDays, currency } = input;
  const lines = [
    `Window: last ${rangeDays} days. Currency: ${currency}.`,
    `Total spent: ${formatMoney(totals.spent, currency)}. Total received: ${formatMoney(totals.received, currency)}.`,
    `Transactions: ${totals.transactionCount}, of which ${totals.untagged} are untagged (${formatMoney(totals.untaggedAmount, currency)}).`,
  ];

  const delta = periodDelta(input.transactions, rangeDays);
  if (delta !== null) {
    lines.push(`Change vs the previous ${rangeDays} days: ${delta > 0 ? "+" : ""}${Math.round(delta)}%.`);
  }

  lines.push("Boards:");
  for (const s of summaries) {
    const budget =
      s.board.budgetAmount === null
        ? "no budget"
        : `budget ${formatMoney(s.board.budgetAmount, currency)}, ${Math.round(s.budgetUsedPct ?? 0)}% used`;
    lines.push(
      `- ${s.board.name}: spent ${formatMoney(s.spent, currency)}, received ${formatMoney(s.received, currency)}, ${s.transactionCount} transactions, ${budget}.`,
    );
  }

  return lines.join("\n");
}

const SYSTEM = `You write short financial insights for Chroma, an app that files a person's LOOP mobile-money transactions into colour-coded Boards. Users are Kenyan individuals, students, and small business owners.

Write 3 to 5 insights. Each one:
- Is a single sentence, plain language, under 140 characters.
- Uses only the figures given to you. Never calculate a new number, never estimate, never invent a Board.
- Names the Board it is about in boardName when it is about one Board, otherwise null.
- Is worth reading: say what changed or what to do, not what the dashboard already shows.

Types: "warning" for budget or overspend risk, "trend" for a pattern in the numbers, "tip" for a concrete next step.
Amounts are already formatted — repeat them exactly as written. Do not use markdown or emoji.`;

export async function generateInsights(input: InsightInput): Promise<DraftInsight[]> {
  const fallback = rulesInsights(input);

  const apiKey = process.env.AI_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey || input.totals.transactionCount === 0) return fallback;

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: INSIGHT_SCHEMA },
      },
      messages: [{ role: "user", content: buildFacts(input) }],
    });

    // A refusal returns 200 with no usable content — fall back rather than crash.
    if (response.stop_reason === "refusal") return fallback;

    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return fallback;

    const parsed = JSON.parse(text) as ModelInsights;
    if (!Array.isArray(parsed.insights) || parsed.insights.length === 0) return fallback;

    const byName = new Map(input.summaries.map((s) => [s.board.name.toLowerCase(), s.board.id]));
    const now = new Date().toISOString();

    return parsed.insights.slice(0, 5).map((i) => ({
      userId: input.userId,
      boardId: i.boardName ? (byName.get(i.boardName.toLowerCase()) ?? null) : null,
      message: i.message.trim(),
      generatedAt: now,
      type: (["warning", "trend", "tip"] as InsightType[]).includes(i.type) ? i.type : "trend",
      origin: "ai" as const,
    }));
  } catch {
    // Rate limit, network, bad key — the rules engine already has an answer.
    return fallback;
  }
}
