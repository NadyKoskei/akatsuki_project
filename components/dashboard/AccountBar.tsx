"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatRelative } from "@/lib/format";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { SessionUser } from "@/lib/types";

export function AccountBar({
  session,
  lastSync,
  demo,
}: {
  session: SessionUser;
  lastSync: string | null;
  demo: boolean;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function sync() {
    setSyncing(true);
    setNotice(null);
    const res = await fetch("/api/loop/sync", { method: "POST" }).catch(() => null);

    if (!res) setNotice("Couldn't reach Chroma's server.");
    else if (res.status === 401) {
      setNotice("LOOP needs you to authorise again.");
      router.push("/?error=auth_required");
    } else if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setNotice(body.error ?? "LOOP didn't respond. Showing the last good pull.");
    } else {
      const body = (await res.json()) as { inserted: number; updated: number };
      setNotice(body.inserted > 0 ? `${body.inserted} new transaction${body.inserted === 1 ? "" : "s"}.` : "Up to date.");
      router.refresh();
    }
    setSyncing(false);
  }

  async function simulate() {
    setNotice(null);
    const res = await fetch("/api/loop/ipn/demo", { method: "POST" }).catch(() => null);
    if (!res || !res.ok) {
      setNotice("Couldn't simulate a notification.");
      return;
    }
    setNotice("A new transaction just landed — file it below.");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[14px] font-semibold tracking-tight">
          <span className="truncate">{session.name}</span>
          <span
            className="shrink-0 rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--text-secondary)]"
            title={`LOOP account ${session.loopAccountRef}`}
          >
            LOOP · {session.userType}
          </span>
        </p>
        <p className="mt-0.5 truncate text-[12px] text-[color:var(--text-secondary)]">
          {lastSync ? `Synced ${formatRelative(lastSync)}` : "Not synced yet"}
          {notice && <span className="text-[color:var(--text-primary)]"> · {notice}</span>}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {demo && (
          <button
            type="button"
            onClick={simulate}
            className="rounded-lg border border-dashed border-[color:var(--border-strong)] px-3 py-1.5 text-[13px] font-medium text-[color:var(--text-secondary)] transition-colors hover:text-[color:var(--text-primary)]"
            title="Fires a simulated LOOP notification at this account"
          >
            Simulate payment
          </button>
        )}

        <button
          type="button"
          onClick={sync}
          disabled={syncing}
          className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-[color:var(--border-strong)] disabled:opacity-60"
        >
          {syncing ? "Pulling…" : "Sync LOOP"}
        </button>

        <ThemeToggle />

        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-[13px] font-medium text-[color:var(--text-secondary)] transition-colors hover:text-[color:var(--text-primary)]"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
