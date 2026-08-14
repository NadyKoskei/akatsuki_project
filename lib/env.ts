/**
 * Secret reading, in one place.
 *
 * Values pasted into a dashboard field routinely arrive with a trailing
 * newline or wrapped in quotes. Both are invisible in the UI and neither is
 * what the operator meant, so they're stripped here — and identically for
 * every reader, since JWT_SECRET also derives the token-encryption key and a
 * mismatch there would silently invalidate stored tokens.
 */
export function readSecret(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;

  const cleaned = raw.trim().replace(/^(['"])(.*)\1$/s, "$2").trim();
  return cleaned === "" ? undefined : cleaned;
}

export const MIN_SECRET_LENGTH = 16;

export type SecretState = "ok" | "missing" | "too_short";

export function secretState(name: string): SecretState {
  const value = readSecret(name);
  if (!value) return "missing";
  return value.length < MIN_SECRET_LENGTH ? "too_short" : "ok";
}

/**
 * Says which of the two problems it is, rather than making the operator guess.
 * Deliberately never includes the value or its length.
 */
export function requireSecret(name: string): string {
  const value = readSecret(name);

  if (!value) {
    throw new Error(
      `${name} is not set on this deployment. Add it in your host's environment variables, then redeploy — ` +
        `env changes don't reach a deployment that was already built.`,
    );
  }

  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} is set but too short — it must be at least ${MIN_SECRET_LENGTH} characters. ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }

  return value;
}
