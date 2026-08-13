"use client";

import { useMemo, useState } from "react";
import { formatCompact, formatMoney } from "@/lib/format";
import type { DayPoint } from "@/lib/services/analytics";
import { niceCeil, useMeasuredWidth } from "./useMeasuredWidth";

/**
 * Daily spend. One series, so no legend box — the card title names what's
 * plotted. A crosshair snaps to the nearest day, the peak carries a direct
 * label, and the table view holds every value the tooltip would show.
 */

const PLOT_H = 176;
const AXIS_H = 24;
const PAD_L = 46;
const PAD_R = 16;
const PAD_T = 20;

export function SpendTrendChart({ points, currency }: { points: DayPoint[]; currency: string }) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  const innerW = Math.max(1, width - PAD_L - PAD_R);
  const max = useMemo(() => niceCeil(Math.max(1, ...points.map((p) => p.spent))), [points]);

  const x = (i: number) => PAD_L + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD_T + (1 - v / max) * PLOT_H;

  const peakIndex = useMemo(() => {
    let best = 0;
    points.forEach((p, i) => {
      if (p.spent > points[best].spent) best = i;
    });
    return best;
  }, [points]);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.spent).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(points.length - 1).toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} L${x(0).toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} Z`;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const active = hover !== null ? points[hover] : null;
  const total = points.reduce((s, p) => s + p.spent, 0);

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const ratio = (px - PAD_L) / innerW;
    const index = Math.round(ratio * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, index)));
  }

  return (
    <section className="card p-5" aria-labelledby="trend-title">
      <header className="mb-1 flex items-start justify-between gap-3">
        <div>
          <h2 id="trend-title" className="text-[15px] font-semibold tracking-tight">
            Money out, day by day
          </h2>
          <p className="mt-0.5 text-[12px] text-[color:var(--text-secondary)]">
            {formatMoney(total, currency)} across {points.length} days
          </p>
        </div>
        <TableToggle on={asTable} onChange={setAsTable} label="spending by day" />
      </header>

      {asTable ? (
        <div className="mt-3 max-h-[220px] overflow-auto">
          <table className="w-full text-[13px]">
            <caption className="sr-only">Spending by day</caption>
            <thead className="sticky top-0 bg-[color:var(--surface-1)] text-left text-[color:var(--text-muted)]">
              <tr>
                <th scope="col" className="py-1.5 font-medium">Day</th>
                <th scope="col" className="py-1.5 text-right font-medium">Spent</th>
                <th scope="col" className="py-1.5 text-right font-medium">Received</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {[...points].reverse().map((p) => (
                <tr key={p.date} className="border-t border-[color:var(--border)]">
                  <td className="py-1.5">{p.date}</td>
                  <td className="py-1.5 text-right">{formatMoney(p.spent, currency)}</td>
                  <td className="py-1.5 text-right text-[color:var(--text-secondary)]">
                    {formatMoney(p.received, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative mt-2">
          <svg
            width={width}
            height={PLOT_H + AXIS_H + PAD_T}
            role="img"
            aria-label={`Daily spending over ${points.length} days. Peak of ${formatMoney(points[peakIndex]?.spent ?? 0, currency)} on ${points[peakIndex]?.date ?? "—"}.`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            className="touch-none"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line className="grid-line" x1={PAD_L} x2={width - PAD_R} y1={y(t)} y2={y(t)} />
                <text className="axis-text" x={PAD_L - 8} y={y(t) + 3.5} textAnchor="end">
                  {formatCompact(t)}
                </text>
              </g>
            ))}

            <line className="axis-line" x1={PAD_L} x2={width - PAD_R} y1={PAD_T + PLOT_H} y2={PAD_T + PLOT_H} />

            <path d={areaPath} fill="var(--series-1)" fillOpacity={0.1} />
            <path
              d={linePath}
              fill="none"
              stroke="var(--series-1)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* The extreme gets the only permanent label on the plot. */}
            {points[peakIndex] && points[peakIndex].spent > 0 && (
              <>
                <circle
                  cx={x(peakIndex)}
                  cy={y(points[peakIndex].spent)}
                  r={4}
                  fill="var(--series-1)"
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                />
                <text
                  className="axis-text"
                  x={Math.min(width - PAD_R - 4, Math.max(PAD_L, x(peakIndex)))}
                  y={Math.max(12, y(points[peakIndex].spent) - 10)}
                  textAnchor={peakIndex > points.length * 0.8 ? "end" : "middle"}
                  fill="var(--text-secondary)"
                >
                  {formatCompact(points[peakIndex].spent, currency)}
                </text>
              </>
            )}

            {hover !== null && (
              <g>
                <line
                  className="axis-line"
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={PAD_T}
                  y2={PAD_T + PLOT_H}
                  stroke="var(--baseline)"
                />
                <circle
                  cx={x(hover)}
                  cy={y(points[hover].spent)}
                  r={4.5}
                  fill="var(--series-1)"
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                />
              </g>
            )}

            {points.length > 1 && (
              <>
                <text className="axis-text" x={PAD_L} y={PAD_T + PLOT_H + 16}>
                  {shortDate(points[0].date)}
                </text>
                <text className="axis-text" x={width - PAD_R} y={PAD_T + PLOT_H + 16} textAnchor="end">
                  {shortDate(points[points.length - 1].date)}
                </text>
              </>
            )}
          </svg>

          {active && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] px-2.5 py-1.5 shadow-[var(--shadow-lift)]"
              style={{
                left: Math.min(width - 70, Math.max(70, x(hover ?? 0))),
                top: Math.max(0, y(active.spent) - 52),
              }}
            >
              <p className="tabular text-[13px] font-semibold leading-tight">{formatMoney(active.spent, currency)}</p>
              <p className="text-[11px] text-[color:var(--text-secondary)]">{shortDate(active.date)}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function TableToggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className="shrink-0 rounded-lg border border-[color:var(--border)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--text-secondary)] transition-colors hover:text-[color:var(--text-primary)]"
    >
      {on ? "Chart" : "Table"}
      <span className="sr-only"> view of {label}</span>
    </button>
  );
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}
