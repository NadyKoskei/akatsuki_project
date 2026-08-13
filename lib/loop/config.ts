import "server-only";

/**
 * All LOOP configuration is read here and nowhere else, so there is exactly one
 * place to point at a different sandbox host or endpoint layout.
 *
 * Sandbox only. Per hackathon Terms 2.4-2.5 this build must never be pointed at
 * a production LOOP host; `assertSandbox()` enforces that at boot.
 */

/**
 * Reads an env var, treating the placeholders shipped in .env.example
 * (`your_loop_sandbox_client_id`, …) as "not set" — otherwise copying the
 * example file would silently point the app at the sandbox with junk
 * credentials instead of falling back to demo mode.
 */
function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  if (!v) return undefined;
  if (/^your_/i.test(v) || v === "generate_a_random_secret") return undefined;
  return v;
}

const BASE = env("LOOP_API_BASE_URL") ?? "https://sandbox.loop.co.ke/api";

/** Strip a trailing /api (or any trailing slash) to get the auth-server origin. */
function authOrigin(base: string): string {
  return base.replace(/\/+$/, "").replace(/\/api$/, "");
}

export const loopConfig = {
  baseUrl: BASE.replace(/\/+$/, ""),
  clientId: env("LOOP_CLIENT_ID"),
  apiKey: env("LOOP_API_KEY"),
  apiSecret: env("LOOP_API_SECRET"),
  redirectUri: env("LOOP_REDIRECT_URI") ?? `${env("APP_BASE_URL") ?? "http://localhost:3000"}/api/loop/callback`,
  ipnCallbackUrl: env("LOOP_IPN_CALLBACK_URL"),
  authorizeUrl: env("LOOP_AUTHORIZE_URL") ?? `${authOrigin(BASE)}/oauth/authorize`,
  tokenUrl: env("LOOP_TOKEN_URL") ?? `${authOrigin(BASE)}/oauth/token`,
  scopes: env("LOOP_SCOPES") ?? "accounts.read transactions.read payments.request",
  appBaseUrl: env("APP_BASE_URL") ?? "http://localhost:3000",
} as const;

/**
 * Demo mode is the seeded-sandbox fallback the README calls for: if the judges'
 * network can't reach the LOOP sandbox, or credentials aren't provisioned yet,
 * sign-in still runs through the same LOOP callback shape against seeded data.
 *
 *   LOOP_DEMO_MODE=auto  (default) -> demo only when credentials are missing
 *   LOOP_DEMO_MODE=true            -> always demo
 *   LOOP_DEMO_MODE=false           -> never demo; missing credentials is a hard error
 */
export function isDemoMode(): boolean {
  const flag = (env("LOOP_DEMO_MODE") ?? "auto").toLowerCase();
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  return !hasLiveCredentials();
}

export function hasLiveCredentials(): boolean {
  return Boolean(loopConfig.clientId && loopConfig.apiSecret);
}

/** Throws when configuration would put this build outside the sandbox. */
export function assertSandbox(): void {
  const host = (() => {
    try {
      return new URL(loopConfig.baseUrl).hostname;
    } catch {
      throw new Error(`LOOP_API_BASE_URL is not a valid URL: ${loopConfig.baseUrl}`);
    }
  })();

  const sandboxish = /(^|\.)sandbox\.|^sandbox\.|(^|\.)uat\.|localhost|127\.0\.0\.1/.test(host);
  if (!sandboxish) {
    throw new Error(
      `Refusing to start: LOOP_API_BASE_URL host "${host}" does not look like a sandbox host. ` +
        `This build is sandbox-only (hackathon Terms 2.4-2.5).`,
    );
  }
}

export function missingCredentialError(): Error {
  return new Error(
    "LOOP sandbox credentials are not configured (LOOP_CLIENT_ID / LOOP_API_SECRET) and " +
      "LOOP_DEMO_MODE=false. Copy .env.example to .env and fill in your sandbox credentials.",
  );
}
