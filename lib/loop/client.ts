import "server-only";

/**
 * Errors from the LOOP gateway.
 *
 * Each LOOP API is called directly by the module that owns it — the request
 * shapes differ enough (form-encoded token, signed JSON envelopes) that a
 * shared wrapper only obscured them. What is shared is how a failure is
 * reported, which is this.
 */
export class LoopApiError extends Error {
  readonly status: number;
  readonly body: string;
  readonly endpoint: string;

  constructor(endpoint: string, status: number, body: string) {
    super(`LOOP ${endpoint} failed with ${status}`);
    this.name = "LoopApiError";
    this.status = status;
    this.body = body;
    this.endpoint = endpoint;
  }

  /**
   * 401/403 from the gateway means the Bearer token was rejected; a 401 in a
   * response envelope means the signature didn't verify. Both mean the stored
   * credentials no longer work.
   */
  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /**
   * The endpoint, the status, and whatever LOOP said about it — the sandbox's
   * own message is far more useful for fixing a misconfiguration than ours.
   */
  get detail(): string {
    const body = this.body.trim();
    if (!body) return this.message;

    try {
      const parsed = JSON.parse(body) as {
        message?: string;
        description?: string;
        error_description?: string;
      };
      const said = parsed.description ?? parsed.error_description ?? parsed.message;
      if (said) return `${this.message} — LOOP said: ${said}`;
    } catch {
      // Not JSON; fall through to the raw text.
    }
    return `${this.message} — LOOP said: ${body.slice(0, 160)}`;
  }
}
