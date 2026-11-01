import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry, isRetryableStatus } from "@/lib/http-retry";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// A Response-ish stub — fetchWithRetry only reads `.ok` and `.status`.
const resp = (status: number) => ({ ok: status >= 200 && status < 300, status }) as Response;

// No real waiting; record the delays the helper asked for.
function harness() {
  const delays: number[] = [];
  const sleep = vi.fn(async (ms: number) => {
    delays.push(ms);
  });
  return { delays, sleep, opts: { sleep, random: () => 0.5, baseDelayMs: 100, maxDelayMs: 1000 } };
}

describe("isRetryableStatus", () => {
  it("retries 429 and 5xx, not 4xx or 2xx", () => {
    expect([429, 500, 502, 503, 504].every(isRetryableStatus)).toBe(true);
    expect([200, 400, 401, 403, 404, 422].some(isRetryableStatus)).toBe(false);
  });
});

describe("fetchWithRetry", () => {
  it("returns the first response and never sleeps on success", async () => {
    const fetchMock = vi.fn(async () => resp(200));
    vi.stubGlobal("fetch", fetchMock);
    const { sleep, opts } = harness();

    const res = await fetchWithRetry("https://x/y", undefined, opts);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries a 500 then returns the eventual 200", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(resp(500)).mockResolvedValueOnce(resp(200));
    vi.stubGlobal("fetch", fetchMock);
    const { delays, opts } = harness();

    const res = await fetchWithRetry("https://x/y", undefined, { ...opts, attempts: 4 });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(delays).toHaveLength(1); // one backoff between the two tries
  });

  it("does not retry a 4xx", async () => {
    const fetchMock = vi.fn(async () => resp(404));
    vi.stubGlobal("fetch", fetchMock);
    const { sleep, opts } = harness();

    const res = await fetchWithRetry("https://x/y", undefined, opts);

    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries a thrown network error then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(resp(200));
    vi.stubGlobal("fetch", fetchMock);
    const { opts } = harness();

    const res = await fetchWithRetry("https://x/y", undefined, { ...opts, attempts: 3 });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after `attempts` tries, returning the last retryable response", async () => {
    const fetchMock = vi.fn(async () => resp(500));
    vi.stubGlobal("fetch", fetchMock);
    const onRetry = vi.fn();
    const { opts } = harness();

    const res = await fetchWithRetry("https://x/y", undefined, { ...opts, attempts: 3, onRetry });

    expect(res.status).toBe(500); // caller's own `if (!res.ok) throw` still fires
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2); // logged before each of the 2 waits
  });

  it("throws the network error when every attempt throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", fetchMock);
    const { opts } = harness();

    await expect(fetchWithRetry("https://x/y", undefined, { ...opts, attempts: 2 })).rejects.toThrow("down");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses exponential backoff capped at maxDelayMs", async () => {
    const fetchMock = vi.fn(async () => resp(503));
    vi.stubGlobal("fetch", fetchMock);
    const { delays, opts } = harness();

    await fetchWithRetry("https://x/y", undefined, { ...opts, attempts: 5, baseDelayMs: 100, maxDelayMs: 300 });

    // random()=0.5 → delay = backoff*0.5 + 0.5*backoff*0.5 = 0.75*backoff.
    // backoff = min(maxDelay, base*2^(n-1)) = 100, 200, 300(capped), 300(capped).
    expect(delays).toEqual([75, 150, 225, 225]);
  });
});
