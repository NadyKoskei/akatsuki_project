import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/loop/config";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BOARD_COLORS } from "@/lib/palette";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  auth_required: "That page needs a connected LOOP till. Connect one to continue.",
  invalid_till: "Check the till number and secret and try again.",
  till_rejected: "LOOP wouldn't verify that till. The number or the secret is wrong.",
  connect_failed: "Chroma couldn't finish connecting that till.",
  config: "Chroma isn't configured for LOOP yet.",
};

const FEATURES = [
  {
    title: "Boards, in your colours",
    body: "Rent, Kilimani Site, Stock Restock — you name them, you colour them. One tap files a transaction.",
  },
  {
    title: "Straight from LOOP",
    body: "Real transaction history over LOOP's sandbox API, plus live notifications the moment money moves.",
  },
  {
    title: "Budgets that speak up",
    body: "Set a limit per Board and Chroma tells you when it's close — before the money is gone.",
  },
  {
    title: "Insights in plain language",
    body: "\"Transport is up 40% this week.\" Patterns worth acting on, not another spreadsheet.",
  },
];

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string; signed_out?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/dashboard");

  const params = await searchParams;
  const message = params.error ? (ERRORS[params.error] ?? "Sign-in didn't complete. Try again.") : null;
  const demo = isDemoMode();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Mark />
          <span className="text-[15px] font-semibold tracking-tight">Chroma</span>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex flex-1 flex-col justify-center gap-14 py-14 lg:flex-row lg:items-center lg:gap-16 lg:py-20">
        <section className="rise max-w-xl flex-1">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--surface-1)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--text-secondary)]">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--series-3)" }}
              aria-hidden="true"
            />
            UNLEASH LOOP &lt;/DEV&gt; Hackathon
          </p>

          <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[54px]">
            Spending,
            <br />
            organised by <span className="sheen">colour</span>.
          </h1>

          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-[color:var(--text-secondary)]">
            Chroma pulls your real LOOP transactions into one feed, then asks one question —{" "}
            <em className="not-italic text-[color:var(--text-primary)]">which Board is this for?</em> Everything else —
            totals, budgets, insights — follows from that single tap.
          </p>

          {message && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm"
              style={{ borderColor: "var(--status-critical)", color: "var(--text-primary)" }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--status-critical)"
                strokeWidth="2"
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16.5v.01" strokeLinecap="round" />
              </svg>
              <span>
                {message}
                {params.detail && (
                  <span className="mt-1 block text-[color:var(--text-secondary)]">{params.detail}</span>
                )}
              </span>
            </div>
          )}

          {params.signed_out && !message && (
            <p className="mt-6 text-sm text-[color:var(--text-secondary)]">
              Signed out. Your LOOP tokens were deleted from Chroma.
            </p>
          )}

          {/*
            The only way in. LOOP's API has no user login, so what a person
            proves here is possession of a till's signing secret — verified by a
            real signed call to LOOP before any session exists.
          */}
          <form method="post" action="/api/auth/loop/connect" className="mt-8 max-w-md">
            <div className="grid gap-3 sm:grid-cols-[1fr_1.3fr]">
              <label className="block text-[12px] font-medium text-[color:var(--text-secondary)]">
                Till number
                <input
                  name="merchantTill"
                  required
                  inputMode="numeric"
                  placeholder={demo ? "133239" : "Your till"}
                  className="tabular mt-1.5 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-1)] px-3 py-2.5 text-[14px] font-normal text-[color:var(--text-primary)] outline-none"
                />
              </label>
              <label className="block text-[12px] font-medium text-[color:var(--text-secondary)]">
                Till secret
                <input
                  name="tillSecret"
                  type="password"
                  required={!demo}
                  placeholder={demo ? "not needed in demo mode" : "Signing secret"}
                  className="mt-1.5 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-1)] px-3 py-2.5 text-[14px] font-normal text-[color:var(--text-primary)] outline-none"
                />
              </label>
            </div>

            <button
              type="submit"
              className="mt-3 inline-flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-3.5 text-[15px] font-semibold text-white shadow-[var(--shadow-lift)] transition-transform duration-200 hover:-translate-y-0.5 sm:w-auto"
              style={{ background: "var(--series-1)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M10 17l5-5-5-5M15 12H3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Connect LOOP till
            </button>

            <p className="mt-3 text-[13px] leading-snug text-[color:var(--text-muted)]">
              A LOOP till is the only way in — no Chroma password, ever. Chroma signs a real request to LOOP to check
              the secret is yours, then stores it encrypted.
            </p>
          </form>

          {demo && (
            <p className="mt-6 max-w-md rounded-xl border border-dashed px-3.5 py-3 text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
              <strong className="font-semibold text-[color:var(--text-primary)]">Seeded sandbox mode.</strong> No LOOP
              sandbox credentials are configured, so sign-in runs the same authorisation flow against a seeded demo
              account. Add your credentials to <code className="text-[12px]">.env</code> to hit the live sandbox.
            </p>
          )}
        </section>

        <section className="rise flex-1" style={{ animationDelay: "120ms" }} aria-hidden="true">
          <BoardsPreview />
        </section>
      </div>

      <footer className="flex flex-col gap-1 border-t border-[color:var(--border)] pt-5 text-[12px] text-[color:var(--text-muted)]">
        <p>Sandbox only — no real transactions, no production systems.</p>
        <p>
          A hackathon prototype. Not affiliated with or endorsed by LOOP DFS Limited or NCBA Group beyond participation
          in the sandboxed hackathon.
        </p>
      </footer>
    </main>
  );
}

function Mark() {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
      <span className="grid grid-cols-2 gap-[2px]">
        {BOARD_COLORS.slice(0, 4).map((c) => (
          <span key={c.key} className="block h-[6px] w-[6px] rounded-[2px]" style={{ background: c.cssVar }} />
        ))}
      </span>
    </span>
  );
}

const PREVIEW = [
  { name: "Rent", color: "var(--series-1)", amount: "KES 32,000", pct: 92 },
  { name: "Kilimani Site", color: "var(--series-2)", amount: "KES 18,400", pct: 64 },
  { name: "Stock Restock", color: "var(--series-3)", amount: "KES 11,250", pct: 41 },
  { name: "Transport", color: "var(--series-4)", amount: "KES 4,180", pct: 22 },
];

function BoardsPreview() {
  return (
    <div className="card mx-auto w-full max-w-md p-5">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
          This month
        </span>
        <span className="text-[12px] text-[color:var(--text-muted)]">4 Boards</span>
      </div>

      <p className="mt-2 text-[38px] font-semibold leading-none tracking-[-0.02em]">KES 65,830</p>

      <ul className="mt-6 space-y-4">
        {PREVIEW.map((b, i) => (
          <li key={b.name}>
            <div className="flex items-center justify-between text-[13px]">
              <span className="flex items-center gap-2 font-medium">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: b.color }} />
                {b.name}
              </span>
              <span className="tabular text-[color:var(--text-secondary)]">{b.amount}</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-sunken)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${b.pct}%`,
                  background: b.color,
                  animation: `rise 700ms cubic-bezier(0.22,1,0.36,1) both`,
                  animationDelay: `${200 + i * 90}ms`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
