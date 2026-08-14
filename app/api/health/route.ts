import { NextResponse } from "next/server";
import { secretState } from "@/lib/env";
import { hasLiveCredentials, isDemoMode } from "@/lib/loop/config";
import { storeName } from "@/lib/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What this deployment can actually see.
 *
 * Answers "but I set it in the dashboard" without anyone reading logs. It
 * reports presence and shape only — never a value, never a length — so it is
 * safe to leave reachable.
 */
export async function GET() {
  const jwt = secretState("JWT_SECRET");
  const cron = secretState("CRON_SECRET");
  const database = process.env.DATABASE_URL?.trim() ? "set" : "missing";

  const checks = {
    // Sign-in is impossible without this one.
    jwtSecret: jwt,
    // "missing" here means Boards and tags won't survive between requests.
    databaseUrl: database,
    store: storeName(),
    loopCredentials: hasLiveCredentials() ? "set" : "missing",
    loopMode: isDemoMode() ? "seeded-demo" : "live-sandbox",
    // Standing orders won't run without this; everything else still works.
    cronSecret: cron,
    aiKey: process.env.AI_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim() ? "set" : "missing",
  } as const;

  // Blocking = sign-in cannot work. Warnings = it runs, but degraded — the
  // file store is a legitimate choice locally, so it isn't a failure here.
  const blocking: string[] = [];
  if (jwt === "missing") blocking.push("JWT_SECRET is not set on this deployment.");
  if (jwt === "too_short") blocking.push("JWT_SECRET is set but shorter than 16 characters.");

  const warnings: string[] = [];
  if (database === "missing") {
    warnings.push(
      "DATABASE_URL is not set. Fine locally; on a serverless host it means Boards and tags won't survive between requests.",
    );
  }
  if (cron !== "ok") warnings.push("CRON_SECRET is not set, so scheduled standing orders will not run.");

  return NextResponse.json(
    {
      ok: blocking.length === 0,
      checks,
      blocking,
      warnings,
      hint:
        blocking.length === 0
          ? "Sign-in is configured."
          : "Set these in your host's environment variables, then redeploy — env changes don't reach an existing deployment.",
    },
    { status: blocking.length === 0 ? 200 : 503 },
  );
}
