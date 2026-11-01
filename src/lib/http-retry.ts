// Small fetch wrapper that retries transient failures with exponential backoff
// and jitter. Used by the Rentvine sync paths (client.ts, balances.ts), where a
// momentary HTTP 500 from Rentvine shouldn't fail the whole nightly sync — one
// such blip on 2026-11-01 knocked out both the core and balances syncs.
//
// It retries on network errors (fetch throws) and on the retryable statuses
// below (429 + 5xx). It does NOT retry 4xx — those are our bugs or auth issues,
// not transient. On the final attempt it returns the last response as-is, so the
// caller's own `if (!res.ok) throw ...` still produces its usual error message.

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

export interface RetryInfo {
  attempt: number; // the attempt that just failed (1-based)
  delayMs: number; // how long we're about to wait
  status?: number; // set when the failure was a retryable HTTP status
  error?: unknown; // set when the failure was a thrown network error
}

export interface RetryOptions {
  attempts?: number; // total tries, default 4
  baseDelayMs?: number; // first backoff, default 500
  maxDelayMs?: number; // backoff ceiling, default 8000
  retryStatus?: (status: number) => boolean;
  onRetry?: (info: RetryInfo) => void;
  // Injectable for tests; defaults to a real timer / Math.random.
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts: RetryOptions = {}
): Promise<Response> {
  const {
    attempts = 4,
    baseDelayMs = 500,
    maxDelayMs = 8000,
    retryStatus = isRetryableStatus,
    onRetry,
    sleep = defaultSleep,
    random = Math.random,
  } = opts;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let res: Response | undefined;
    try {
      res = await fetch(url, init);
    } catch (e) {
      lastError = e;
    }

    if (res) {
      // Success, a non-retryable status, or out of tries: hand it back and let
      // the caller decide (its own `!res.ok` check throws on a final 5xx).
      if (res.ok || !retryStatus(res.status) || attempt === attempts) return res;
    } else if (attempt === attempts) {
      throw lastError;
    }

    // Exponential backoff with half-jitter: wait between 50% and 100% of the
    // capped backoff, so parallel requests don't all retry in lockstep.
    const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
    const delayMs = backoff / 2 + random() * (backoff / 2);
    onRetry?.({ attempt, delayMs, status: res?.status, error: res ? undefined : lastError });
    await sleep(delayMs);
  }

  // Unreachable: the loop always returns or throws on its last iteration.
  throw lastError ?? new Error("fetchWithRetry: exhausted attempts");
}
