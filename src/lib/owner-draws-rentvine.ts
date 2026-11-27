// Server-only: the live Rentvine side of Owner Draws (see ./owner-draws.ts).
//
//   "Portfolio Balances" report → balance (operatingBalance), reserve
//      (totalReserveAmount), unpaid bills (accountsPayableBalance), hold flag.
//   "Payables" report (unpaid, non-voided) → the bill lines behind the unpaid
//      figure, for the itemized list (they add up to accountsPayableBalance).
//
// Rentvine rate-limits these report calls (HTTP 429), so:
//   - the two reports run one after the other, not at once;
//   - 429/5xx are retried with a longer backoff, honouring Retry-After;
//   - a good result is cached for CACHE_TTL_MS (per server instance), so a
//     reload doesn't hit Rentvine again — `fresh: true` skips it (the Refresh
//     button, and approve/paid snapshots, which must be current);
//   - if Rentvine still fails, the last good figures (up to STALE_MAX_MS old)
//     are shown, flagged stale with their time, instead of an empty page.
// Needs RENTVINE_API_KEY / RENTVINE_API_SECRET (+ RENTVINE_BASE_URL or
// RENTVINE_SUBDOMAIN).

import { fetchWithRetry, type RetryOptions } from "@/lib/http-retry";
import { parsePayables, parsePortfolioBalances, type DrawBill, type DrawPortfolio, type ReportRow } from "@/lib/owner-draws";

export type OwnerDrawData =
  | {
      ok: true;
      portfolios: DrawPortfolio[];
      bills: Map<string, DrawBill[]>;
      asOf: string; // ISO time Rentvine returned these figures
      stale?: boolean; // Rentvine failed just now; these are the last good figures
      staleReason?: string;
    }
  | { ok: false; status: number; error: string; busy?: boolean };

type Fresh = Extract<OwnerDrawData, { ok: true }>;

export const CACHE_TTL_MS = 5 * 60 * 1000;
const STALE_MAX_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, Fresh>();
const inFlight = new Map<string, Promise<OwnerDrawData>>();

export function clearOwnerDrawCache() {
  cache.clear();
  inFlight.clear();
}

const BALANCE_COLUMNS = [
  "portfolio",
  "contacts",
  "reserveAmount",
  "totalReserveAmount",
  "holdDistributions",
  "operatingBalance",
  "accountsPayableBalance",
  "distributableAmount",
];
const PAYABLE_COLUMNS = ["portfolioID", "billID", "description", "chargeAccountID", "amountUnpaid", "dateDue", "isVoided"];

function baseUrl(): string {
  const explicit = (process.env.RENTVINE_BASE_URL || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const sub = process.env.RENTVINE_SUBDOMAIN || process.env.RENTVINE_ACCOUNT || "pmilighthouse";
  return `https://${sub}.rentvine.com/api/manager`;
}

class ReportError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

// 5 tries, 1s → 2s → 4s → 8s apart (or longer if Retry-After says so). Fits the
// page's 60s budget with both reports run in turn. Exported so tests skip the wait.
export const reportRetry: RetryOptions = { attempts: 5, baseDelayMs: 1000, maxDelayMs: 10000, maxRetryAfterMs: 15000 };

async function runReport(route: string, displayColumns: string[], filters: Record<string, unknown>[]): Promise<ReportRow[]> {
  const auth = Buffer.from(`${process.env.RENTVINE_API_KEY || ""}:${process.env.RENTVINE_API_SECRET || ""}`).toString("base64");
  const json = encodeURIComponent(JSON.stringify({ displayColumns, filters }));
  const res = await fetchWithRetry(
    `${baseUrl()}/reports/${route}?exportTypeID=1&json=${json}`,
    { headers: { Accept: "application/json", Authorization: `Basic ${auth}` }, cache: "no-store" },
    reportRetry
  );
  if (!res.ok) throw new ReportError(`Rentvine ${route} report failed (HTTP ${res.status}).`, res.status);
  const payload = (await res.json()) as { rows?: ReportRow[] };
  return Array.isArray(payload.rows) ? payload.rows : [];
}

const BUSY = "Rentvine is busy right now (too many requests). Wait a minute and hit Retry.";

// Every portfolio (or just `portfolioId`) with its unpaid bills.
export async function loadOwnerDrawData(portfolioId?: string, opts: { fresh?: boolean } = {}): Promise<OwnerDrawData> {
  if (!process.env.RENTVINE_API_KEY || !process.env.RENTVINE_API_SECRET) {
    return { ok: false, status: 503, error: "Rentvine isn't configured — set RENTVINE_API_KEY / RENTVINE_API_SECRET." };
  }
  const key = portfolioId || "*";
  const hit = cache.get(key);
  if (!opts.fresh && hit && Date.now() - Date.parse(hit.asOf) < CACHE_TTL_MS) return hit;

  // Two tabs loading at once share one set of Rentvine calls.
  const pending = inFlight.get(key);
  if (pending) return pending;
  const run = fetchFresh(portfolioId).finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  const res = await run;

  if (res.ok) {
    cache.set(key, res);
    return res;
  }
  if (hit && Date.now() - Date.parse(hit.asOf) < STALE_MAX_MS) {
    const why = res.status === 429 ? "Rentvine is busy right now" : `Rentvine didn't answer (HTTP ${res.status})`;
    return { ...hit, stale: true, staleReason: why };
  }
  return res;
}

async function fetchFresh(portfolioId?: string): Promise<OwnerDrawData> {
  const only = portfolioId ? [{ name: "portfolioID", comparator: "equals", value: portfolioId }] : [];
  try {
    // One at a time: firing both together is what trips Rentvine's rate limit.
    const balanceRows = await runReport("portfolio-balances", BALANCE_COLUMNS, only);
    const payableRows = await runReport("payables", PAYABLE_COLUMNS, [
      { name: "isPaid", comparator: "booleanFalse" },
      { name: "isVoided", comparator: "booleanFalse" },
      ...only,
    ]);
    return {
      ok: true,
      portfolios: parsePortfolioBalances(balanceRows),
      bills: parsePayables(payableRows),
      asOf: new Date().toISOString(),
    };
  } catch (e) {
    const status = e instanceof ReportError ? e.status : 502;
    if (status === 429) return { ok: false, status, error: BUSY, busy: true };
    return { ok: false, status, error: e instanceof Error ? e.message : "Rentvine request failed." };
  }
}
