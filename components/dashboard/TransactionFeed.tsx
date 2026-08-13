"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatMoney, formatRelative } from "@/lib/format";
import { colorVar } from "@/lib/palette";
import { suggestBoard } from "@/lib/services/suggest";
import type { Board, Transaction } from "@/lib/types";

const SOURCE_LABEL: Record<Transaction["source"], string> = {
  till: "Till",
  paybill: "Paybill",
  transfer: "Transfer",
  checkout: "Checkout",
  request_to_pay: "Request to Pay",
};

/**
 * The feed, and the one question Chroma asks: which Board is this for?
 * Untagged money sits at the top until it's filed — nothing pulled from LOOP
 * goes untracked.
 */
export function TransactionFeed({
  transactions,
  boards,
  currency,
}: {
  transactions: Transaction[];
  boards: Board[];
  currency: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"needs" | "all">("needs");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const untagged = useMemo(
    () =>
      transactions
        .filter((t) => !t.boardId)
        // Live IPN arrivals jump the queue — they're the "just happened" prompt.
        .sort((a, b) => Number(Boolean(b.live)) - Number(Boolean(a.live))),
    [transactions],
  );

  const shown = tab === "needs" ? untagged : transactions;
  const boardById = new Map(boards.map((b) => [b.id, b]));

  async function tag(txnId: string, boardId: string | null) {
    setPendingId(txnId);
    setError(null);

    const res = await fetch(`/api/transactions/${txnId}/tag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId }),
    }).catch(() => null);

    if (!res || !res.ok) {
      setError("Couldn't file that one. Try again.");
      setPendingId(null);
      return;
    }

    router.refresh();
    setPendingId(null);
  }

  return (
    <section className="card p-5" aria-labelledby="feed-heading">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="feed-heading" className="text-[15px] font-semibold tracking-tight">
            Transaction feed
          </h2>
          <p className="mt-0.5 text-[12px] text-[color:var(--text-secondary)]">
            {untagged.length === 0
              ? "Everything in this window is filed."
              : `${untagged.length} transaction${untagged.length === 1 ? "" : "s"} still need a Board.`}
          </p>
        </div>

        <div className="flex gap-1" role="group" aria-label="Feed filter">
          {(
            [
              ["needs", `Needs a Board${untagged.length ? ` (${untagged.length})` : ""}`],
              ["all", `All (${transactions.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className="rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={{
                borderColor: tab === key ? "var(--border-strong)" : "var(--border)",
                color: tab === key ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <p role="alert" className="mt-3 text-[13px]" style={{ color: "var(--status-critical)" }}>
          {error}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="mt-6 text-[13px] text-[color:var(--text-secondary)]">
          {tab === "needs" ? "Nothing waiting. Every transaction has a Board." : "No transactions in this window."}
        </p>
      ) : (
        <ul className="mt-4 max-h-[560px] divide-y divide-[color:var(--border)] overflow-auto">
          {shown.slice(0, 60).map((txn) => {
            const board = txn.boardId ? boardById.get(txn.boardId) : undefined;
            const suggestion = board ? null : suggestBoard(txn, boards, transactions);
            const busy = pendingId === txn.id;

            return (
              <li key={txn.id} className={`py-3 ${busy ? "is-refetching" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[14px] font-medium">
                      <span className="truncate">{txn.counterparty}</span>
                      {txn.live && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: "color-mix(in srgb, var(--series-1) 18%, transparent)", color: "var(--text-primary)" }}
                        >
                          Just in
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-[color:var(--text-secondary)]">
                      {SOURCE_LABEL[txn.source]}
                      {txn.description && ` · ${txn.description}`} · {formatRelative(txn.timestamp)}
                    </p>
                  </div>

                  <p
                    className="tabular shrink-0 text-[14px] font-semibold"
                    style={{ color: txn.direction === "credit" ? "var(--delta-good)" : "var(--text-primary)" }}
                  >
                    {txn.direction === "credit" ? "+" : "−"}
                    {formatMoney(txn.amount, txn.currency || currency)}
                  </p>
                </div>

                {board ? (
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[12px]"
                    >
                      <span
                        className="h-2 w-2 rounded-[2px]"
                        style={{ background: colorVar(board.colorCode) }}
                        aria-hidden="true"
                      />
                      {board.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => tag(txn.id, null)}
                      disabled={busy}
                      className="text-[12px] text-[color:var(--text-muted)] underline underline-offset-2 hover:text-[color:var(--text-primary)]"
                    >
                      Unfile
                    </button>
                  </div>
                ) : (
                  <div className="mt-2">
                    <div className="flex flex-wrap gap-1.5">
                      {boards.map((b) => {
                        const suggested = suggestion?.boardId === b.id;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => tag(txn.id, b.id)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-50"
                            style={{
                              borderColor: suggested ? colorVar(b.colorCode) : "var(--border)",
                              background: suggested ? `color-mix(in srgb, ${colorVar(b.colorCode)} 12%, transparent)` : "transparent",
                            }}
                          >
                            <span
                              className="h-2 w-2 rounded-[2px]"
                              style={{ background: colorVar(b.colorCode) }}
                              aria-hidden="true"
                            />
                            {b.name}
                          </button>
                        );
                      })}
                    </div>
                    {suggestion && (
                      <p className="mt-1.5 text-[11px] text-[color:var(--text-muted)]">{suggestion.reason}</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {shown.length > 60 && (
        <p className="mt-3 text-[12px] text-[color:var(--text-muted)]">
          Showing the 60 most recent of {shown.length}. Narrow the date range to see the rest.
        </p>
      )}
    </section>
  );
}
