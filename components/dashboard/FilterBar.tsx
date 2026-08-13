"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { RANGES, type RangeKey } from "@/lib/services/analytics";

/**
 * One filter row, above everything it scopes — every tile, chart, Board and
 * insight below re-renders against the same slice. While the new slice loads,
 * the previous render is held at reduced opacity: no skeleton, no layout jump.
 */
export function FilterBar({ range, children }: { range: RangeKey; children: ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function select(next: RangeKey) {
    const query = new URLSearchParams(params.toString());
    query.set("range", next);
    startTransition(() => router.push(`/dashboard?${query.toString()}`, { scroll: false }));
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Date range">
        {RANGES.map((r) => {
          const selected = r.key === range;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => select(r.key)}
              aria-pressed={selected}
              className="rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors"
              style={{
                borderColor: selected ? "var(--border-strong)" : "var(--border)",
                background: selected ? "var(--surface-1)" : "transparent",
                color: selected ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {selected && <span aria-hidden="true" className="mr-1.5 font-bold">✓</span>}
              {r.label}
            </button>
          );
        })}
      </div>

      <div className={pending ? "is-refetching" : undefined}>{children}</div>
    </>
  );
}
