import "server-only";
import { loopConfig } from "./config";

/**
 * Thin HTTP client for the LOOP sandbox.
 *
 * Everything that talks to LOOP goes through here so retries, timeouts, header
 * shape and error normalisation exist once. Endpoint *paths* are passed in by
 * the calling module, so re-pointing at a different sandbox route layout is a
 * one-line change there rather than a rewrite here.
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

  /** 401/403 mean the stored token is no longer good for this account. */
  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Bearer token for a connected LOOP account. */
  accessToken?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Attempts including the first. Only idempotent GETs retry by default. */
  retries?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 12_000;

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path.startsWith("http") ? path : `${loopConfig.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function loopRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = "GET",
    accessToken,
    body,
    query,
    retries = method === "GET" ? 3 : 1,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers = {},
  } = options;

  const url = buildUrl(path, query);
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(loopConfig.apiKey ? { "X-API-Key": loopConfig.apiKey } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const error = new LoopApiError(path, res.status, text.slice(0, 500));

        // Retry transient failures only; 4xx other than 429 will not improve.
        const transient = res.status === 429 || res.status >= 500;
        if (transient && attempt < retries) {
          const retryAfter = Number(res.headers.get("retry-after"));
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 250);
          lastError = error;
          continue;
        }
        throw error;
      }

      if (res.status === 204) return undefined as T;
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
    } catch (err) {
      lastError = err;
      if (err instanceof LoopApiError) throw err;
      // Network error / timeout — retry with backoff.
      if (attempt < retries) {
        await sleep(2 ** attempt * 250);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`LOOP request to ${path} failed after ${retries} attempts`);
}
