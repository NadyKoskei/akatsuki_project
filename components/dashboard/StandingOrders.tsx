"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate, formatMoney } from "@/lib/format";
import { colorVar } from "@/lib/palette";
import type { Board, StandingOrder, StandingOrderKind } from "@/lib/types";

const KIND: Record<StandingOrderKind, { label: string; glyph: string; blurb: string }> = {
  bill: { label: "Bill", glyph: "▤", blurb: "Rent, power, water, internet" },
  savings: { label: "Savings", glyph: "▲", blurb: "Money you move to yourself" },
  investment: { label: "Investment", glyph: "◆", blurb: "MMF, SACCO, shares" },
};

/**
 * Standing orders: the money that leaves on a schedule.
 *
 * Chroma holds the instruction, not the money — when one falls due the runner
 * asks LOOP to make the payment and files the result to the chosen Board.
 */
export function StandingOrders({
  orders,
  boards,
  currency,
  monthlyTotal,
}: {
  orders: StandingOrder[];
  boards: Board[];
  currency: string;
  monthlyTotal: number;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const boardById = new Map(boards.map((b) => [b.id, b]));

  async function act(order: StandingOrder, action: "toggle" | "run" | "delete") {
    setBusyId(order.id);
    setNotice(null);

    const request =
      action === "delete"
        ? fetch(`/api/standing-orders/${order.id}`, { method: "DELETE" })
        : action === "run"
          ? fetch(`/api/standing-orders/${order.id}/run`, { method: "POST" })
          : fetch(`/api/standing-orders/${order.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: order.status === "active" ? "paused" : "active" }),
            });

    const res = await request.catch(() => null);

    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => ({})) : {};
      setNotice(body?.result?.detail ?? body?.error ?? "That didn't go through.");
    } else if (action === "run") {
      const body = (await res.json()) as { result: { detail: string } };
      setNotice(`Sent — ${body.result.detail}`);
      router.refresh();
    } else {
      router.refresh();
    }

    setBusyId(null);
  }

  return (
    <section className="card p-5" aria-labelledby="standing-heading">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="standing-heading" className="text-[15px] font-semibold tracking-tight">
            Standing orders
          </h2>
          <p className="mt-0.5 text-[12px] text-[color:var(--text-secondary)]">
            {orders.length === 0
              ? "Bills, savings and investments that repeat"
              : `${formatMoney(monthlyTotal, currency)} committed per month across ${orders.length} order${orders.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="shrink-0 rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-[color:var(--border-strong)]"
        >
          + New order
        </button>
      </header>

      {notice && (
        <p role="status" className="mt-3 text-[13px] text-[color:var(--text-secondary)]">
          {notice}
        </p>
      )}

      {orders.length === 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {(Object.keys(KIND) as StandingOrderKind[]).map((k) => (
            <div key={k} className="rounded-xl border border-dashed border-[color:var(--border)] p-3">
              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                <span aria-hidden="true" className="text-[color:var(--text-muted)]">
                  {KIND[k].glyph}
                </span>
                {KIND[k].label}
              </p>
              <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">{KIND[k].blurb}</p>
            </div>
          ))}
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-[color:var(--border)]">
          {orders.map((order) => {
            const board = order.boardId ? boardById.get(order.boardId) : undefined;
            const paused = order.status === "paused";
            const busy = busyId === order.id;

            return (
              <li key={order.id} className={`py-3 ${busy ? "is-refetching" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[14px] font-medium">
                      <span aria-hidden="true" className="text-[color:var(--text-muted)]">
                        {KIND[order.kind].glyph}
                      </span>
                      <span className="truncate">{order.name}</span>
                      {paused && (
                        <span className="shrink-0 rounded-full border border-[color:var(--border)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--text-muted)]">
                          Paused
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-[color:var(--text-secondary)]">
                      {KIND[order.kind].label} · {order.frequency === "weekly" ? "Weekly" : "Monthly"} · to{" "}
                      {order.destination}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">
                      {paused ? "Paused" : `Next ${formatDate(order.nextRunAt)}`}
                      {order.lastRunAt && ` · last sent ${formatDate(order.lastRunAt)}`}
                      {board && (
                        <>
                          {" · files to "}
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="inline-block h-2 w-2 rounded-[2px] align-middle"
                              style={{ background: colorVar(board.colorCode) }}
                              aria-hidden="true"
                            />
                            {board.name}
                          </span>
                        </>
                      )}
                    </p>
                  </div>

                  <p className="tabular shrink-0 text-[14px] font-semibold">{formatMoney(order.amount, order.currency)}</p>
                </div>

                <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                  <button
                    type="button"
                    onClick={() => act(order, "run")}
                    disabled={busy}
                    className="rounded-lg border border-[color:var(--border)] px-2.5 py-1 font-medium transition-colors hover:border-[color:var(--border-strong)] disabled:opacity-50"
                  >
                    Pay now
                  </button>
                  <button
                    type="button"
                    onClick={() => act(order, "toggle")}
                    disabled={busy}
                    className="rounded-lg border border-[color:var(--border)] px-2.5 py-1 text-[color:var(--text-secondary)] transition-colors hover:text-[color:var(--text-primary)] disabled:opacity-50"
                  >
                    {paused ? "Resume" : "Pause"}
                  </button>
                  <button
                    type="button"
                    onClick={() => act(order, "delete")}
                    disabled={busy}
                    className="rounded-lg px-2.5 py-1 disabled:opacity-50"
                    style={{ color: "var(--status-critical)" }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {creating && <OrderDialog boards={boards} currency={currency} onClose={() => setCreating(false)} />}
    </section>
  );
}

function OrderDialog({
  boards,
  currency,
  onClose,
}: {
  boards: Board[];
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<StandingOrderKind>("bill");
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("monthly");
  const [boardId, setBoardId] = useState(boards[0]?.id ?? "");
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/standing-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind, amount, destination, frequency, boardId: boardId || null, startsAt }),
    }).catch(() => null);

    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => ({})) : {};
      setError(body.error ?? "Couldn't create that standing order.");
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
      aria-label="New standing order"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form onSubmit={save} className="card rise w-full max-w-md p-5" style={{ background: "var(--surface-1)" }}>
        <h3 className="text-[15px] font-semibold tracking-tight">New standing order</h3>
        <p className="mt-1 text-[12px] text-[color:var(--text-secondary)]">
          Chroma asks LOOP to make this payment when it falls due, then files it to your Board.
        </p>

        <fieldset className="mt-4">
          <legend className="text-[12px] font-medium text-[color:var(--text-secondary)]">What is it for</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(Object.keys(KIND) as StandingOrderKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className="rounded-lg border px-2 py-2 text-[12px] font-medium transition-colors"
                style={{
                  borderColor: kind === k ? "var(--border-strong)" : "var(--border)",
                  background: kind === k ? "var(--surface-2)" : "transparent",
                }}
              >
                <span aria-hidden="true" className="mr-1 text-[color:var(--text-muted)]">
                  {KIND[k].glyph}
                </span>
                {KIND[k].label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="mt-4 block text-[12px] font-medium text-[color:var(--text-secondary)]">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            maxLength={60}
            placeholder={kind === "savings" ? "Emergency fund" : kind === "investment" ? "Money market fund" : "Rent"}
            className="mt-1.5 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-[14px] font-normal text-[color:var(--text-primary)] outline-none"
          />
        </label>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-[12px] font-medium text-[color:var(--text-secondary)]">
            Amount ({currency})
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              inputMode="decimal"
              placeholder="32000"
              className="tabular mt-1.5 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-[14px] font-normal text-[color:var(--text-primary)] outline-none"
            />
          </label>

          <label className="block text-[12px] font-medium text-[color:var(--text-secondary)]">
            How often
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as "weekly" | "monthly")}
              className="mt-1.5 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-[14px] font-normal text-[color:var(--text-primary)] outline-none"
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
        </div>

        <label className="mt-4 block text-[12px] font-medium text-[color:var(--text-secondary)]">
          Paybill, till or account
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            required
            maxLength={60}
            placeholder="888880"
            className="mt-1.5 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-[14px] font-normal text-[color:var(--text-primary)] outline-none"
          />
        </label>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-[12px] font-medium text-[color:var(--text-secondary)]">
            File to Board
            <select
              value={boardId}
              onChange={(e) => setBoardId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-[14px] font-normal text-[color:var(--text-primary)] outline-none"
            >
              <option value="">No Board</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-[12px] font-medium text-[color:var(--text-secondary)]">
            First payment
            <input
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-[14px] font-normal text-[color:var(--text-primary)] outline-none"
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-[13px]" style={{ color: "var(--status-critical)" }}>
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[color:var(--border)] px-3.5 py-2 text-[13px] font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--series-1)" }}
          >
            {busy ? "Saving…" : "Create order"}
          </button>
        </div>
      </form>
    </div>
  );
}
