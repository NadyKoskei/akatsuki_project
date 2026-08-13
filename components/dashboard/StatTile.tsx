import type { ReactNode } from "react";

/**
 * Stat tile: label · value · optional delta · optional note.
 * Proportional figures on the value — tabular-nums only aligns columns.
 */
export function StatTile({
  label,
  value,
  delta,
  note,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  delta?: { pct: number; upIsGood: boolean; versus: string } | null;
  note?: string;
  tone?: "neutral" | "warning" | "critical" | "good";
  icon?: ReactNode;
}) {
  const toneColor =
    tone === "critical"
      ? "var(--status-critical)"
      : tone === "warning"
        ? "var(--status-warning)"
        : tone === "good"
          ? "var(--status-good)"
          : "var(--text-muted)";

  const deltaGood = delta ? (delta.pct > 0) === delta.upIsGood : false;

  return (
    <div className="card card-interactive p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium text-[color:var(--text-secondary)]">{label}</p>
        {icon && (
          <span className="shrink-0" style={{ color: toneColor }} aria-hidden="true">
            {icon}
          </span>
        )}
      </div>

      <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.01em]">{value}</p>

      {delta && (
        <p className="mt-2 flex items-center gap-1 text-[12px]">
          <span
            className="font-medium"
            style={{ color: deltaGood ? "var(--delta-good)" : "var(--status-critical)" }}
          >
            {delta.pct > 0 ? "▲" : "▼"} {Math.abs(Math.round(delta.pct))}%
          </span>
          <span className="text-[color:var(--text-muted)]">{delta.versus}</span>
        </p>
      )}

      {note && !delta && <p className="mt-2 text-[12px] text-[color:var(--text-muted)]">{note}</p>}
    </div>
  );
}
