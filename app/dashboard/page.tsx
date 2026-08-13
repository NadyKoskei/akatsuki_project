import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getLastSync, listBoards, listInsights, listTransactions, replaceInsights } from "@/lib/db/store";
import { isDemoMode } from "@/lib/loop/config";
import { formatCompact, formatMoney } from "@/lib/format";
import {
  computeTotals,
  periodDelta,
  rangeDays,
  RANGES,
  spendByDay,
  summariseBoards,
  toChartSlices,
  withinRange,
  type RangeKey,
} from "@/lib/services/analytics";
import { rulesInsights } from "@/lib/services/insights";
import { AccountBar } from "@/components/dashboard/AccountBar";
import { BoardsGrid } from "@/components/dashboard/BoardsGrid";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { InsightsPanel } from "@/components/dashboard/InsightsPanel";
import { StatTile } from "@/components/dashboard/StatTile";
import { TransactionFeed } from "@/components/dashboard/TransactionFeed";
import { BoardSpendChart } from "@/components/charts/BoardSpendChart";
import { SpendTrendChart } from "@/components/charts/SpendTrendChart";

export const dynamic = "force-dynamic";

function parseRange(value: string | undefined): RangeKey {
  return RANGES.some((r) => r.key === value) ? (value as RangeKey) : "30d";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  // The middleware already gated this route; this is the belt-and-braces check
  // that also gives the page its typed session.
  const session = await getSession();
  if (!session) redirect("/?error=auth_required");

  const range = parseRange((await searchParams).range);
  const days = rangeDays(range) ?? 90;

  const [boards, all] = await Promise.all([listBoards(session.id), listTransactions(session.id)]);
  const scoped = withinRange(all, range);

  const summaries = summariseBoards(boards, scoped);
  const totals = computeTotals(scoped, summaries);
  const slices = toChartSlices(summaries);
  const series = spendByDay(scoped, days);
  const delta = periodDelta(all, days);
  const currency = scoped[0]?.currency ?? all[0]?.currency ?? "KES";

  // First visit: seed the panel from the deterministic engine so it's never
  // empty. The Refresh button is what asks the model for a rewrite.
  let insights = await listInsights(session.id);
  if (insights.length === 0 && scoped.length > 0) {
    insights = await replaceInsights(
      session.id,
      rulesInsights({ userId: session.id, summaries, transactions: all, totals, rangeDays: days, currency }),
    );
  }

  const rangeLabel = RANGES.find((r) => r.key === range)?.label.toLowerCase() ?? "this period";

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-6 sm:px-8">
      <header className="mb-6 border-b border-[color:var(--border)] pb-5">
        <AccountBar session={session} lastSync={await getLastSync(session.id)} demo={isDemoMode()} />
      </header>

      <FilterBar range={range}>
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* The one hero figure on this view. */}
          <section className="card rise relative overflow-hidden p-5">
            <span
              className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full opacity-[0.14] blur-2xl"
              style={{ background: "var(--series-1)" }}
              aria-hidden="true"
            />
            <p className="text-[12px] font-medium text-[color:var(--text-secondary)]">
              Money out · {rangeLabel}
            </p>
            <p className="mt-2 text-[clamp(40px,6vw,52px)] font-semibold leading-none tracking-[-0.025em]">
              {formatMoney(totals.spent, currency)}
            </p>
            <p className="mt-3 text-[12px] text-[color:var(--text-secondary)]">
              {totals.transactionCount} transaction{totals.transactionCount === 1 ? "" : "s"} from LOOP ·{" "}
              {formatMoney(totals.received, currency)} in
            </p>
          </section>

          <StatTile
            label="Change in spend"
            value={delta === null ? "—" : `${delta > 0 ? "+" : ""}${Math.round(delta)}%`}
            delta={delta === null ? null : { pct: delta, upIsGood: false, versus: `vs previous ${days} days` }}
            note={delta === null ? "Not enough history to compare yet" : undefined}
          />

          <StatTile
            label="Needs a Board"
            value={String(totals.untagged)}
            note={
              totals.untagged === 0
                ? "Everything is filed"
                : `${formatCompact(totals.untaggedAmount, currency)} untracked`
            }
            tone={totals.untagged > 0 ? "warning" : "good"}
            icon={
              totals.untagged > 0 ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3 2.5 20h19L12 3Z" strokeLinejoin="round" />
                  <path d="M12 10v4M12 17.5v.01" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m4 12.5 5 5 11-11" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )
            }
          />

          <StatTile
            label="Budget pressure"
            value={`${totals.boardsOverBudget + totals.boardsNearBudget}`}
            note={
              totals.boardsOverBudget > 0
                ? `${totals.boardsOverBudget} over, ${totals.boardsNearBudget} near the limit`
                : totals.boardsNearBudget > 0
                  ? `${totals.boardsNearBudget} Board${totals.boardsNearBudget === 1 ? "" : "s"} near the limit`
                  : "Every budgeted Board is on track"
            }
            tone={totals.boardsOverBudget > 0 ? "critical" : totals.boardsNearBudget > 0 ? "warning" : "good"}
          />
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          <SpendTrendChart points={series} currency={currency} />
          <BoardSpendChart slices={slices} currency={currency} />
        </div>

        <div className="mt-6">
          <BoardsGrid summaries={summaries} currency={currency} />
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <TransactionFeed transactions={scoped} boards={boards} currency={currency} />
          <InsightsPanel insights={insights} boards={boards} range={range} />
        </div>
      </FilterBar>

      <footer className="mt-10 border-t border-[color:var(--border)] pt-5 text-[11px] text-[color:var(--text-muted)]">
        <p>
          Sandbox data only. Chroma stores LOOP access tokens encrypted at rest and never holds your LOOP credentials.
        </p>
      </footer>
    </main>
  );
}
