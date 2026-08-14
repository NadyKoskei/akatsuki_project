import "server-only";

/**
 * LOOP sandbox configuration.
 *
 * The sandbox is a WSO2 API Manager gateway. Every API is published under
 * https://sandbox.loop.co.ke/gateway/<context>/<version>, and the gateway
 * rejects any unauthenticated request — including paths that don't exist — with
 * a blanket 401, so a 401 tells you nothing about whether a path is right.
 *
 * Auth is machine-to-machine: Basic(Consumer Key:Consumer Secret) against the
 * Authorisation API returns a Bearer token. There is no user-facing consent
 * screen anywhere in this API surface.
 *
 * Sandbox only. assertSandbox() enforces that at sign-in, per hackathon
 * Terms 2.4-2.5.
 */

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  if (!v) return undefined;
  // Placeholders from .env.example are "not set", not junk credentials.
  if (/^your_/i.test(v) || v === "generate_a_random_secret") return undefined;
  return v;
}

const GATEWAY = (env("LOOP_GATEWAY_URL") ?? "https://sandbox.loop.co.ke/gateway").replace(/\/+$/, "");

export const loopConfig = {
  gatewayUrl: GATEWAY,

  /** Authorisation API — POST, Basic auth, grant_type=client_credentials. */
  tokenUrl: env("LOOP_TOKEN_URL") ?? `${GATEWAY}/auth/1.0/oauth2/token`,

  /** Merchant transaction history — POST, Bearer + signed body. */
  historyUrl: env("LOOP_HISTORY_URL") ?? `${GATEWAY}/transaction-history/1.0.0/services/process-request`,

  /** Merchant transaction status inquiry. */
  inquiryUrl: env("LOOP_INQUIRY_URL") ?? `${GATEWAY}/transaction-inquiry/1.0.0/services/process-request`,

  /** Outgoing payments, used by standing orders. */
  payToPaybillUrl: env("LOOP_PAY_PAYBILL_URL") ?? `${GATEWAY}/pay-to-paybill/1.0/services/process-request`,
  payToTillUrl: env("LOOP_PAY_TILL_URL") ?? `${GATEWAY}/pay-to-looptill/1.0/services/process-request`,
  sendMoneyUrl: env("LOOP_SEND_MONEY_URL") ?? `${GATEWAY}/send-money-loop/1.0/services/process-request`,

  /** From Developer Portal -> Application -> Sandbox Keys -> Generate Keys. */
  consumerKey: env("LOOP_CONSUMER_KEY") ?? env("LOOP_CLIENT_ID"),
  consumerSecret: env("LOOP_CONSUMER_SECRET") ?? env("LOOP_API_SECRET"),

  ipnCallbackUrl: env("LOOP_IPN_CALLBACK_URL"),
  appBaseUrl: env("APP_BASE_URL") ?? "http://localhost:3000",
} as const;

/** Both halves are needed: the key alone can't mint a token. */
export function hasLiveCredentials(): boolean {
  return Boolean(loopConfig.consumerKey && loopConfig.consumerSecret);
}

/**
 * Seeded sandbox fallback — the README's guard against a rate-limited or
 * unreachable sandbox on presentation day.
 *
 *   auto  (default) -> demo only when credentials are missing
 *   true            -> always demo
 *   false           -> never demo; missing credentials is a hard error
 */
export function isDemoMode(): boolean {
  const flag = (env("LOOP_DEMO_MODE") ?? "auto").toLowerCase();
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  return !hasLiveCredentials();
}

export function assertSandbox(): void {
  const host = (() => {
    try {
      return new URL(loopConfig.gatewayUrl).hostname;
    } catch {
      throw new Error(`LOOP_GATEWAY_URL is not a valid URL: ${loopConfig.gatewayUrl}`);
    }
  })();

  const sandboxish = /(^|\.)sandbox\.|(^|\.)uat\.|localhost|127\.0\.0\.1/.test(host);
  if (!sandboxish) {
    throw new Error(
      `Refusing to start: LOOP gateway host "${host}" does not look like a sandbox. ` +
        `This build is sandbox-only (hackathon Terms 2.4-2.5).`,
    );
  }
}

export function missingCredentialError(): Error {
  return new Error(
    "LOOP sandbox credentials are not configured (LOOP_CONSUMER_KEY / LOOP_CONSUMER_SECRET) and " +
      "LOOP_DEMO_MODE=false. Generate them at Developer Portal -> Application -> Sandbox Keys.",
  );
}
