// Server-only: the live Rentvine side of Owner Draws (see ./owner-draws.ts).
//
//   "Portfolio Balances" report → balance (operatingBalance), reserve
//      (totalReserveAmount), unpaid bills (accountsPayableBalance), hold flag.
//   "Payables" report (unpaid, non-voided) → the bill lines behind the unpaid
//      figure, for the itemized list (they add up to accountsPayableBalance).
//
// Both run on every page load (always fresh, like Security Deposits). Needs
// RENTVINE_API_KEY / RENTVINE_API_SECRET (+ RENTVINE_BASE_URL or
// RENTVINE_SUBDOMAIN).

import { parsePayables, parsePortfolioBalances, type DrawBill, type DrawPortfolio, type ReportRow } from "@/lib/owner-draws";

export type OwnerDrawData =
  | { ok: true; portfolios: DrawPortfolio[]; bills: Map<string, DrawBill[]> }
  | { ok: false; status: number; error: string };

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

async function runReport(route: string, displayColumns: string[], filters: Record<string, unknown>[]): Promise<ReportRow[]> {
  const auth = Buffer.from(`${process.env.RENTVINE_API_KEY || ""}:${process.env.RENTVINE_API_SECRET || ""}`).toString("base64");
  const json = encodeURIComponent(JSON.stringify({ displayColumns, filters }));
  const res = await fetch(`${baseUrl()}/reports/${route}?exportTypeID=1&json=${json}`, {
    headers: { Accept: "application/json", Authorization: `Basic ${auth}` },
    cache: "no-store",
  });
  if (!res.ok) throw new ReportError(`Rentvine ${route} report failed (HTTP ${res.status}).`, res.status);
  const payload = (await res.json()) as { rows?: ReportRow[] };
  return Array.isArray(payload.rows) ? payload.rows : [];
}

// Every portfolio (or just `portfolioId`) with its unpaid bills.
export async function loadOwnerDrawData(portfolioId?: string): Promise<OwnerDrawData> {
  if (!process.env.RENTVINE_API_KEY || !process.env.RENTVINE_API_SECRET) {
    return { ok: false, status: 503, error: "Rentvine isn't configured — set RENTVINE_API_KEY / RENTVINE_API_SECRET." };
  }
  const only = portfolioId ? [{ name: "portfolioID", comparator: "equals", value: portfolioId }] : [];
  try {
    const [balanceRows, payableRows] = await Promise.all([
      runReport("portfolio-balances", BALANCE_COLUMNS, only),
      runReport("payables", PAYABLE_COLUMNS, [
        { name: "isPaid", comparator: "booleanFalse" },
        { name: "isVoided", comparator: "booleanFalse" },
        ...only,
      ]),
    ]);
    return { ok: true, portfolios: parsePortfolioBalances(balanceRows), bills: parsePayables(payableRows) };
  } catch (e) {
    const status = e instanceof ReportError ? e.status : 502;
    return { ok: false, status, error: e instanceof Error ? e.message : "Rentvine request failed." };
  }
}
