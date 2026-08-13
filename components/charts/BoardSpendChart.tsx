"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { colorVar } from "@/lib/palette";
import type { ChartSlice } from "@/lib/services/analytics";
import { useMeasuredWidth } from "./useMeasuredWidth";
import { TableToggle } from "./SpendTrendChart";

/**
 * Spend per Board.
 *
 * Colour follows the Board, never its rank — filtering the range re-orders the
 * bars but never repaints them. Every bar carries its name and its value, which
 * is also the relief the light-mode palette needs (aqua, yellow and magenta sit
 * below 3:1 on the light surface), so nothing is encoded by colour alone.
 */

const BAR_H = 18;
const ROW_H = 32;
const LABEL_W = 116;
const PAD_R = 4;
const CHAR_W = 6.4; // 11px system sans, close enough to reserve a gutter

export function BoardSpendChart({ slices, currency }: { slices: ChartSlice[]; currency: string }) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const [asTable, setAsTable] = useState(false);

  if (slices.length === 0) {
    return (
      <section className="card flex flex-col justify-center p-5" aria-labelledby="boards-title">
        <h2 id="boards-title" className="text-[15px] font-semibold tracking-tight">
          Where it went
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
          Nothing filed in this window yet. Tag a transaction below and it lands here.
        </p>
      </section>
    );
  }

  const total = slices.reduce((s, x) => s + x.value, 0);
  const max = Math.max(...slices.map((s) => s.value));

  // Reserve exactly enough room for the longest value so no label overflows.
  const gutter = 10 + Math.max(...slices.map((s) => formatMoney(s.value, currency).length)) * CHAR_W;
  const trackW = Math.max(24, width - LABEL_W - gutter - PAD_R);
  const height = slices.length * ROW_H;

  return (
    <section className="card p-5" aria-labelledby="boards-title">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 id="boards-title" className="text-[15px] font-semibold tracking-tight">
            Where it went
          </h2>
          <p className="mt-0.5 text-[12px] text-[color:var(--text-secondary)]">
            {slices.length} Board{slices.length === 1 ? "" : "s"} · {formatMoney(total, currency)} filed
          </p>
        </div>
        <TableToggle on={asTable} onChange={setAsTable} label="spending by Board" />
      </header>

      {asTable ? (
        <table className="w-full text-[13px]">
          <caption className="sr-only">Spending by Board</caption>
          <thead className="text-left text-[color:var(--text-muted)]">
            <tr>
              <th scope="col" className="py-1.5 font-medium">Board</th>
              <th scope="col" className="py-1.5 text-right font-medium">Spent</th>
              <th scope="col" className="py-1.5 text-right font-medium">Share</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {slices.map((s) => (
              <tr key={s.id} className="border-t border-[color:var(--border)]">
                <td className="py-1.5">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: colorVar(s.colorCode) }} />
                    {s.label}
                  </span>
                </td>
                <td className="py-1.5 text-right">{formatMoney(s.value, currency)}</td>
                <td className="py-1.5 text-right text-[color:var(--text-secondary)]">
                  {Math.round((s.value / total) * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div ref={ref} className="relative">
          <svg width={width} height={height} role="img" aria-label="Spending by Board">
            {slices.map((s, i) => {
              const barW = Math.max(3, (s.value / max) * trackW);
              const top = i * ROW_H + (ROW_H - BAR_H) / 2;
              const isHover = hover === s.id;
              const name = s.label.length > 17 ? `${s.label.slice(0, 16)}…` : s.label;

              return (
                <g
                  key={s.id}
                  onPointerEnter={() => setHover(s.id)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(s.id)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  role="listitem"
                  aria-label={`${s.label}: ${formatMoney(s.value, currency)}, ${Math.round((s.value / total) * 100)} percent`}
                >
                  {/* Hit area spans the whole row — never just the painted bar. */}
                  <rect x={0} y={i * ROW_H} width={Math.max(width, 1)} height={ROW_H} fill="transparent" />

                  <rect x={0} y={top + 5} width={9} height={9} rx={2.5} fill={colorVar(s.colorCode)} />
                  <text className="axis-text" x={16} y={top + BAR_H / 2 + 4} fill="var(--text-primary)">
                    {name}
                  </text>

                  <rect
                    x={LABEL_W}
                    y={top}
                    width={barW}
                    height={BAR_H}
                    rx={4}
                    fill={colorVar(s.colorCode)}
                    opacity={isHover ? 0.82 : 1}
                  />
                  {/* Square off the baseline end; only the data end is rounded. */}
                  <rect x={LABEL_W} y={top} width={Math.min(4, barW)} height={BAR_H} fill={colorVar(s.colorCode)} opacity={isHover ? 0.82 : 1} />

                  <text
                    className="axis-text"
                    x={LABEL_W + barW + 8}
                    y={top + BAR_H / 2 + 4}
                    fill="var(--text-secondary)"
                  >
                    {formatMoney(s.value, currency)}
                  </text>
                </g>
              );
            })}
            <line className="axis-line" x1={LABEL_W} x2={LABEL_W} y1={0} y2={height} />
          </svg>

          {hover && (
            <div
              className="pointer-events-none absolute left-[116px] z-10 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] px-2.5 py-1.5 shadow-[var(--shadow-lift)]"
              style={{
                // Above the row, except the first one — there it would cover its own bar.
                top:
                  slices.findIndex((s) => s.id === hover) === 0
                    ? ROW_H + 2
                    : slices.findIndex((s) => s.id === hover) * ROW_H - 42,
              }}
            >
              {(() => {
                const s = slices.find((x) => x.id === hover)!;
                return (
                  <>
                    <p className="tabular text-[13px] font-semibold leading-tight">{formatMoney(s.value, currency)}</p>
                    <p className="flex items-center gap-1.5 text-[11px] text-[color:var(--text-secondary)]">
                      <span className="h-[2px] w-3 rounded-full" style={{ background: colorVar(s.colorCode) }} />
                      {s.label} · {Math.round((s.value / total) * 100)}% of filed spend
                    </p>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
