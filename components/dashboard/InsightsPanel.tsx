"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatRelative } from "@/lib/format";
import { colorVar } from "@/lib/palette";
import type { RangeKey } from "@/lib/services/analytics";
import type { Board, Insight } from "@/lib/types";

const TYPE_STYLE: Record<Insight["type"], { color: string; glyph: string; label: string }> = {
  warning: { color: "var(--status-warning)", glyph: "▲", label: "Watch" },
  trend: { color: "var(--series-1)", glyph: "◆", label: "Trend" },
  tip: { color: "var(--status-good)", glyph: "●", label: "Tip" },
};

export function InsightsPanel({
  insights,
  boards,
  range,
}: {
  insights: Insight[];
  boards: Board[];
  range: RangeKey;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const boardById = new Map(boards.map((b) => [b.id, b]));

  async function regenerate() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ range }),
    }).catch(() => null);

    if (!res || !res.ok) setError("Couldn't refresh insights just now.");
    else router.refresh();
    setBusy(false);
  }

  const generatedAt = insights[0]?.generatedAt;
  const aiWritten = insights.some((i) => i.origin === "ai");

  return (
    <section className="card p-5" aria-labelledby="insights-heading">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 id="insights-heading" className="text-[15px] font-semibold tracking-tight">
            Insights
          </h2>
          <p className="mt-0.5 text-[12px] text-[color:var(--text-secondary)]">
            {generatedAt ? `Read from your Boards ${formatRelative(generatedAt)}` : "Nothing generated yet"}
            {aiWritten ? " · AI-written" : insights.length > 0 ? " · rules engine" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={regenerate}
          disabled={busy}
          className="shrink-0 rounded-lg border border-[color:var(--border)] px-2.5 py-1 text-[12px] font-medium transition-colors hover:border-[color:var(--border-strong)] disabled:opacity-60"
        >
          {busy ? "Thinking…" : "Refresh"}
        </button>
      </header>

      {error && (
        <p role="alert" className="mt-3 text-[13px]" style={{ color: "var(--status-critical)" }}>
          {error}
        </p>
      )}

      <ul className={`mt-4 space-y-3 ${busy ? "is-refetching" : ""}`}>
        {insights.length === 0 && (
          <li className="text-[13px] text-[color:var(--text-secondary)]">
            File a few transactions and Chroma will start noticing patterns.
          </li>
        )}

        {insights.map((insight) => {
          const style = TYPE_STYLE[insight.type];
          const board = insight.boardId ? boardById.get(insight.boardId) : undefined;

          return (
            <li key={insight.id} className="flex gap-2.5">
              <span className="mt-[3px] shrink-0 text-[11px]" style={{ color: style.color }} aria-hidden="true">
                {style.glyph}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] leading-relaxed">{insight.message}</p>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[color:var(--text-muted)]">
                  <span>{style.label}</span>
                  {board && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="flex items-center gap-1">
                        <span
                          className="h-2 w-2 rounded-[2px]"
                          style={{ background: colorVar(board.colorCode) }}
                          aria-hidden="true"
                        />
                        {board.name}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
