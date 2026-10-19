// Server-only: live security-deposit figures from Rentvine's "Lease Security
// Deposit Balance" report (reportTypeID 56), fetched over the Manager REST API.
//
// Rentvine splits each lease's deposit into what the MANAGER holds in trust
// (heldSecurityDepositBalance) and what the OWNER holds
// (ownerHeldSecurityDepositBalance); the report's headline total adds both,
// which overstates the company's actual trust liability. This module pulls the
// raw rows so the page can show the honest breakdown: PMI-held on active
// leases, PMI-held on moved-out leases (pending refund), and owner-held
// (excluded). Needs RENTVINE_API_KEY / RENTVINE_API_SECRET and a base URL
// (RENTVINE_BASE_URL) on the service — the same creds the work-order create uses.

export type DepositHolder = "pmi" | "owner";

export type DepositRow = {
  leaseId: string;
  propertyId: string;
  address: string;
  portfolio: string;
  tenant: string;
  status: string; // lease status name
  movedOut: boolean; // lease closed / moved out
  total: number; // securityDepositBalance
  held: number; // heldSecurityDepositBalance (PMI trust)
  ownerHeld: number; // ownerHeldSecurityDepositBalance
  holder: DepositHolder;
};

export type DepositSummary = {
  reportTotal: number; // what the raw Rentvine report shows
  pmiHeldActive: number; // PMI trust on active leases — the real liability
  pmiHeldMovedOut: number; // PMI trust on moved-out leases — pending refund
  ownerHeld: number; // held by the owner — excluded from PMI trust
};

export type DepositsResult =
  | { ok: true; rows: DepositRow[]; summary: DepositSummary; asOf: string }
  | { ok: false; status: number; error: string };

const REPORT_ROUTE = "lease-security-deposit-balance";
const COLUMNS = [
  "unitAddress",
  "portfolioName",
  "primaryTenantName",
  "leaseStatusName",
  "moveOutDate",
  "securityDepositBalance",
  "heldSecurityDepositBalance",
  "ownerHeldSecurityDepositBalance",
];

export function isRentvineConfigured(): boolean {
  return Boolean((process.env.RENTVINE_API_KEY || "") && (process.env.RENTVINE_API_SECRET || ""));
}

function baseUrl(): string {
  const explicit = (process.env.RENTVINE_BASE_URL || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const sub = process.env.RENTVINE_SUBDOMAIN || process.env.RENTVINE_ACCOUNT || "pmilighthouse";
  return `https://${sub}.rentvine.com/api/manager`;
}

function money(v: unknown): number {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

// A lease whose status or move-out date means the tenant has gone — any deposit
// PMI still holds against it is pending a refund/disposition.
function isMovedOut(statusName: string, moveOutDate: string): boolean {
  if (/closed|moved\s*out|evicted|broken/i.test(statusName)) return true;
  if (moveOutDate) {
    const d = new Date(moveOutDate);
    if (!Number.isNaN(d.getTime()) && d.getTime() <= Date.now()) return true;
  }
  return false;
}

export async function fetchSecurityDeposits(): Promise<DepositsResult> {
  const apiKey = process.env.RENTVINE_API_KEY || "";
  const apiSecret = process.env.RENTVINE_API_SECRET || "";
  if (!apiKey || !apiSecret) {
    return {
      ok: false,
      status: 503,
      error: "Rentvine isn't configured — set RENTVINE_API_KEY / RENTVINE_API_SECRET.",
    };
  }

  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const json = encodeURIComponent(
    JSON.stringify({ displayColumns: COLUMNS, orderBys: ["securityDepositBalance"] })
  );
  const url = `${baseUrl()}/reports/${REPORT_ROUTE}?exportTypeID=1&json=${json}`;

  let payload: unknown;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Basic ${auth}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        error: `Rentvine report failed (HTTP ${res.status}). ${text.slice(0, 200)}`,
      };
    }
    payload = await res.json();
  } catch (e) {
    return { ok: false, status: 502, error: e instanceof Error ? e.message : "Rentvine request failed." };
  }

  const report = (payload ?? {}) as {
    rows?: { rowTypeID?: number; data?: Record<string, unknown> }[];
    displayFilters?: { label?: string; details?: string }[];
  };
  const rawRows = Array.isArray(report.rows) ? report.rows : [];

  const rows: DepositRow[] = [];
  for (const r of rawRows) {
    if (r?.rowTypeID !== 3 || !r.data) continue; // 3 = data row; 4 = totals
    const d = r.data;
    const total = money(d.securityDepositBalance);
    const held = money(d.heldSecurityDepositBalance);
    const ownerHeld = money(d.ownerHeldSecurityDepositBalance);
    if (total === 0 && held === 0 && ownerHeld === 0) continue; // skip the many zero leases
    const status = str(d.leaseStatusName);
    const movedOut = isMovedOut(status, str(d.moveOutDate));
    rows.push({
      leaseId: str(d.leaseID),
      propertyId: str(d.propertyID),
      address: str(d.unitAddress),
      portfolio: str(d.portfolioName),
      tenant: str(d.primaryTenantName),
      status,
      movedOut,
      total,
      held,
      ownerHeld,
      holder: ownerHeld > 0 && held === 0 ? "owner" : "pmi",
    });
  }

  // Sort biggest balance first.
  rows.sort((a, b) => b.total - a.total);

  const summary: DepositSummary = {
    reportTotal: rows.reduce((s, r) => s + r.total, 0),
    pmiHeldActive: rows.filter((r) => !r.movedOut).reduce((s, r) => s + r.held, 0),
    pmiHeldMovedOut: rows.filter((r) => r.movedOut).reduce((s, r) => s + r.held, 0),
    ownerHeld: rows.reduce((s, r) => s + r.ownerHeld, 0),
  };

  const asOf =
    report.displayFilters?.find((f) => /as of/i.test(f.label || ""))?.details?.trim() ||
    new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return { ok: true, rows, summary, asOf };
}
