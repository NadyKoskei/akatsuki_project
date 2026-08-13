"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { BOARD_COLORS, colorVar, nextColor } from "@/lib/palette";
import type { BoardSummary } from "@/lib/types";

export function BoardsGrid({ summaries, currency }: { summaries: BoardSummary[]; currency: string }) {
  const [editing, setEditing] = useState<BoardSummary | null>(null);
  const [creating, setCreating] = useState(false);

  const taken = summaries.map((s) => s.board.colorCode);

  return (
    <section aria-labelledby="boards-heading">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id="boards-heading" className="text-[15px] font-semibold tracking-tight">
            Your Boards
          </h2>
          <p className="mt-0.5 text-[12px] text-[color:var(--text-secondary)]">
            Name them after real life. Colour is how you find them at a glance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="shrink-0 rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-[color:var(--border-strong)]"
        >
          + New Board
        </button>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {summaries.map((s) => (
          <li key={s.board.id}>
            <BoardCard summary={s} currency={currency} onEdit={() => setEditing(s)} />
          </li>
        ))}
      </ul>

      {summaries.length === 0 && (
        <p className="card p-5 text-[13px] text-[color:var(--text-secondary)]">
          No Boards yet. Create one and start filing.
        </p>
      )}

      {(creating || editing) && (
        <BoardDialog
          board={editing?.board ?? null}
          suggestedColor={nextColor(taken)}
          currency={currency}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function BoardCard({
  summary,
  currency,
  onEdit,
}: {
  summary: BoardSummary;
  currency: string;
  onEdit: () => void;
}) {
  const { board, spent, received, transactionCount, budgetUsedPct, budgetState, firstAt, lastAt } = summary;
  const accent = colorVar(board.colorCode);

  // Fill carries severity; the track is a lighter step of the same colour.
  const fill =
    budgetState === "over" ? "var(--status-critical)" : budgetState === "near" ? "var(--status-warning)" : accent;

  return (
    <article className="card card-interactive relative overflow-hidden p-4">
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent }} aria-hidden="true" />

      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold">
          <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: accent }} aria-hidden="true" />
          <span className="truncate">{board.name}</span>
        </h3>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 text-[12px] text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text-primary)]"
        >
          Edit<span className="sr-only"> {board.name}</span>
        </button>
      </div>

      <p className="mt-3 text-[22px] font-semibold leading-none tracking-[-0.01em]">{formatMoney(spent, currency)}</p>
      <p className="mt-1.5 text-[12px] text-[color:var(--text-secondary)]">
        {transactionCount} transaction{transactionCount === 1 ? "" : "s"}
        {firstAt && lastAt && (
          <>
            {" · "}
            {formatDate(firstAt)} – {formatDate(lastAt)}
          </>
        )}
        {received > 0 && <> · {formatMoney(received, currency)} in</>}
      </p>

      {board.budgetAmount !== null ? (
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
            <span className="text-[color:var(--text-secondary)]">
              {formatPercent(budgetUsedPct ?? 0)} of {formatMoney(board.budgetAmount, currency)}
            </span>
            <BudgetChip state={budgetState} />
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full"
            style={{ background: `color-mix(in srgb, ${fill} 18%, var(--surface-sunken))` }}
            role="img"
            aria-label={`${formatPercent(budgetUsedPct ?? 0)} of budget used`}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.min(100, budgetUsedPct ?? 0)}%`, background: fill }}
            />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-[12px] text-[color:var(--text-muted)]">
          No budget set —{" "}
          <button type="button" onClick={onEdit} className="underline underline-offset-2">
            add a limit
          </button>
        </p>
      )}
    </article>
  );
}

/** Status never rides on colour alone — icon plus label, every time. */
function BudgetChip({ state }: { state: BoardSummary["budgetState"] }) {
  if (state === "none") return null;

  const config = {
    ok: { color: "var(--status-good)", label: "On track", glyph: "●" },
    near: { color: "var(--status-warning)", label: "Near limit", glyph: "▲" },
    over: { color: "var(--status-critical)", label: "Over budget", glyph: "■" },
  }[state];

  return (
    <span className="flex items-center gap-1 font-medium text-[color:var(--text-secondary)]">
      <span aria-hidden="true" style={{ color: config.color }}>
        {config.glyph}
      </span>
      {config.label}
    </span>
  );
}

function BoardDialog({
  board,
  suggestedColor,
  currency,
  onClose,
}: {
  board: { id: string; name: string; colorCode: string; budgetAmount: number | null } | null;
  suggestedColor: string;
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(board?.name ?? "");
  const [colorCode, setColorCode] = useState(board?.colorCode ?? suggestedColor);
  const [budget, setBudget] = useState(board?.budgetAmount != null ? String(board.budgetAmount / 100) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch(board ? `/api/boards/${board.id}` : "/api/boards", {
      method: board ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, colorCode, budgetAmount: budget.trim() === "" ? null : Number(budget) }),
    }).catch(() => null);

    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => ({})) : {};
      setError(body.error ?? "Couldn't save that Board.");
      setBusy(false);
      return;
    }

    router.refresh();
    onClose();
  }

  async function remove() {
    if (!board) return;
    setBusy(true);
    const res = await fetch(`/api/boards/${board.id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      setError("Couldn't delete that Board.");
      setBusy(false);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={board ? `Edit ${board.name}` : "New Board"}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form onSubmit={save} className="card rise w-full max-w-md p-5" style={{ background: "var(--surface-1)" }}>
        <h3 className="text-[15px] font-semibold tracking-tight">{board ? "Edit Board" : "New Board"}</h3>

        <label className="mt-4 block text-[12px] font-medium text-[color:var(--text-secondary)]">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            required
            autoFocus
            placeholder="Kilimani Site"
            className="mt-1.5 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-[14px] font-normal text-[color:var(--text-primary)] outline-none"
          />
        </label>

        <fieldset className="mt-4">
          <legend className="text-[12px] font-medium text-[color:var(--text-secondary)]">Colour</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {BOARD_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setColorCode(c.key)}
                aria-pressed={colorCode === c.key}
                aria-label={c.name}
                title={c.name}
                className="flex h-8 w-8 items-center justify-center rounded-lg border transition-transform hover:scale-105"
                style={{
                  background: c.cssVar,
                  borderColor: colorCode === c.key ? "var(--text-primary)" : "transparent",
                  outline: colorCode === c.key ? "2px solid var(--surface-1)" : "none",
                  outlineOffset: "-3px",
                }}
              >
                {colorCode === c.key && (
                  <span className="text-[13px] font-bold text-white drop-shadow" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="mt-4 block text-[12px] font-medium text-[color:var(--text-secondary)]">
          Budget ({currency}) — optional
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            inputMode="decimal"
            placeholder="25000"
            className="mt-1.5 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-[14px] font-normal tabular text-[color:var(--text-primary)] outline-none"
          />
        </label>

        {error && (
          <p role="alert" className="mt-3 text-[13px]" style={{ color: "var(--status-critical)" }}>
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          {board ? (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="text-[13px] font-medium disabled:opacity-50"
              style={{ color: "var(--status-critical)" }}
            >
              Delete
            </button>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[color:var(--border)] px-3.5 py-2 text-[13px] font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || name.trim() === ""}
              className="rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--series-1)" }}
            >
              {busy ? "Saving…" : board ? "Save" : "Create Board"}
            </button>
          </div>
        </div>

        {board && (
          <p className="mt-3 text-[11px] text-[color:var(--text-muted)]">
            Deleting a Board keeps its transactions — they simply become untagged. LOOP data is never removed.
          </p>
        )}
      </form>
    </div>
  );
}
