// Server-only: live accounting figures from Rentvine's Manager REST API.
//
// Two v1 cards, both read live on page load (no sync / no Neon mirror — always
// fresh, like Security Deposits; see the rentvine-report-page skill):
//
//  - Cash on hand: the current balance of each live bank account, from the
//    "Bank Balance Breakdown" report (one call per account; the balance is the
//    sum of the account's ledger rows as of today).
//  - Reimbursables: the running balance and recent activity on the PMI
//    Lighthouse Reimbursable vendor account, from the "Vendor Ledger" report —
//    outstanding = charges (expenses fronted) minus payments (reimbursed).
//
// Needs RENTVINE_API_KEY / RENTVINE_API_SECRET (+ RENTVINE_BASE_URL or
// RENTVINE_SUBDOMAIN) on the service — the same creds the other Rentvine
// report pages use.

// PMI Lighthouse's live bank accounts (the inactive "DO NOT USE" 156/157 are
// excluded). Ids are Rentvine bankAccountIDs; override the set later if the
// account structure changes.
export const CASH_ACCOUNTS: { id: string; name: string }[] = [
  { id: "171", name: "Corporate" },
  { id: "175", name: "Residential Trust" },
  { id: "176", name: "Security Deposit" },
];

// The vendor account reimbursables are tracked through (overridable).
const REIMBURSABLE_VENDOR_ID = process.env.RENTVINE_REIMBURSABLE_VENDOR_ID || "503";

// How many recent ledger lines to surface in the activity feed.
const RECENT_LIMIT = 25;

export type CashAccount = { id: string; name: string; balance: number };

export type CashOnHandResult =
  | { ok: true; accounts: CashAccount[]; total: number; asOf: string }
  | { ok: false; status: number; error: string };

export type ReimbursableRow = {
  date: string;
  description: string;
  charges: number;
  payments: number;
  reference: string;
  property: string;
};

export type ReimbursablesResult =
  | {
      ok: true;
      outstanding: number;
      totalCharges: number;
      totalPayments: number;
      rows: ReimbursableRow[];
      asOf: string;
    }
  | { ok: false; status: number; error: string };

type ReportRow = { rowTypeID?: number; data?: Record<string, unknown> };
type ReportFilter = Record<string, unknown>;

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

// Rentvine names bank accounts like "Residential Trust Bank Account"; drop the
// trailing "Bank Account" for a cleaner label.
function cleanAccountName(v: string): string {
  return v.replace(/\s*bank account$/i, "").trim();
}

function today(): string {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Run one Rentvine report and return its data rows (rowTypeID 3; 4 = totals).
// Throws { status } on an HTTP/transport error so callers can map to ok:false.
async function runReport(
  route: string,
  body: { displayColumns: string[]; orderBys?: string[]; filters: ReportFilter[] }
): Promise<ReportRow[]> {
  const auth = Buffer.from(
    `${process.env.RENTVINE_API_KEY || ""}:${process.env.RENTVINE_API_SECRET || ""}`
  ).toString("base64");
  const json = encodeURIComponent(JSON.stringify(body));
  const url = `${baseUrl()}/reports/${route}?exportTypeID=1&json=${json}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Basic ${auth}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Rentvine report ${route} failed (HTTP ${res.status}). ${text.slice(0, 200)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const payload = (await res.json()) as { rows?: ReportRow[] };
  return Array.isArray(payload.rows) ? payload.rows : [];
}

function errorResult(e: unknown): { ok: false; status: number; error: string } {
  const status = (e as { status?: number })?.status;
  return {
    ok: false,
    status: typeof status === "number" ? status : 502,
    error: e instanceof Error ? e.message : "Rentvine request failed.",
  };
}

// Sum the balance across a report's data rows (ignoring the totals row).
export function sumDataBalances(rows: ReportRow[]): number {
  return rows
    .filter((r) => r?.rowTypeID === 3 && r.data)
    .reduce((s, r) => s + money(r.data!.balance), 0);
}

export async function fetchCashOnHand(): Promise<CashOnHandResult> {
  if (!isRentvineConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Rentvine isn't configured — set RENTVINE_API_KEY / RENTVINE_API_SECRET.",
    };
  }

  try {
    const accounts = await Promise.all(
      CASH_ACCOUNTS.map(async (acct): Promise<CashAccount> => {
        const rows = await runReport("bank-balance-breakdown", {
          displayColumns: ["ledgerID", "balance"],
          filters: [
            { name: "bankAccount", comparator: "equals", value: acct.id },
            { name: "datePosted", comparator: "today" },
          ],
        });
        return { id: acct.id, name: acct.name, balance: sumDataBalances(rows) };
      })
    );
    const total = accounts.reduce((s, a) => s + a.balance, 0);
    return { ok: true, accounts, total, asOf: today() };
  } catch (e) {
    return errorResult(e);
  }
}

// Reimbursable summary from vendor-ledger rows: charges are expenses PMI
// fronted, payments are reimbursements received, outstanding is the net still
// owed on the account.
export function summarizeReimbursables(rows: ReportRow[]): {
  outstanding: number;
  totalCharges: number;
  totalPayments: number;
  activity: ReimbursableRow[];
} {
  const data = rows.filter((r) => r?.rowTypeID === 3 && r.data);
  let totalCharges = 0;
  let totalPayments = 0;
  const activity: ReimbursableRow[] = data.map((r) => {
    const d = r.data!;
    const charges = money(d.charges);
    const payments = money(d.payments);
    totalCharges += charges;
    totalPayments += payments;
    return {
      date: str(d.datePosted),
      description: str(d.description),
      charges,
      payments,
      reference: str(d.billReference),
      property: str(d.propertyName),
    };
  });
  // Newest first; rows with an unparseable date sort last.
  activity.sort((a, b) => {
    const ta = Date.parse(a.date);
    const tb = Date.parse(b.date);
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });
  return { outstanding: totalCharges - totalPayments, totalCharges, totalPayments, activity };
}

export async function fetchReimbursables(): Promise<ReimbursablesResult> {
  if (!isRentvineConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Rentvine isn't configured — set RENTVINE_API_KEY / RENTVINE_API_SECRET.",
    };
  }

  try {
    const rows = await runReport("vendor-ledger", {
      displayColumns: ["datePosted", "description", "charges", "payments", "balance", "billReference", "propertyName"],
      orderBys: ["datePosted"],
      filters: [
        { name: "vendorContactID", comparator: "equals", value: REIMBURSABLE_VENDOR_ID },
        { name: "datePosted", comparator: "allTime" },
        { name: "isVoided", comparator: "booleanFalse" },
      ],
    });
    const { outstanding, totalCharges, totalPayments, activity } = summarizeReimbursables(rows);
    return {
      ok: true,
      outstanding,
      totalCharges,
      totalPayments,
      rows: activity.slice(0, RECENT_LIMIT),
      asOf: today(),
    };
  } catch (e) {
    return errorResult(e);
  }
}

// --- Money out (payments) -------------------------------------------------
//
// Rentvine's "Money Out → Payments": every payment written from a bank account,
// from the Check Register report. Each row has a real payee (the contact paid —
// owner draw, vendor bill, etc.), which the reimbursables ledger doesn't carry.

const MONEY_OUT_DAYS = 90; // default window ("last 90 days")

export type MoneyOutRow = {
  payoutId: string; // Rentvine payoutID (stable key for batching)
  bankAccount: string; // source bank account the payment was drawn from
  date: string; // datePosted, ISO (YYYY-MM-DD)
  payee: string; // who was paid
  payeeType: string; // Owner | Vendor | Manager | …
  method: string; // Check | eCheck (ACH) | Bank Transfer | …
  checkNumber: string;
  memo: string;
  amount: number;
};

export type MoneyOutResult =
  | { ok: true; rows: MoneyOutRow[]; total: number; count: number; asOf: string }
  | { ok: false; status: number; error: string };

// Payment-type enumerations from the Check Register report meta.
const PAYOUT_TYPES: Record<string, string> = { "1": "Other", "2": "Check", "3": "eCheck (ACH)", "4": "NACHA (ACH)" };
const OTHER_PAYOUT_TYPES: Record<string, string> = {
  "1": "Cash",
  "2": "Credit/Debit Card",
  "3": "Bank Transfer",
  "4": "Check",
  "5": "Other",
};
const PAYEE_TYPES: Record<string, string> = {
  "1": "Owner",
  "2": "Tenant",
  "3": "Vendor",
  "4": "Manager",
  "5": "Association",
  "6": "Applicant",
  "7": "Screening Prospect",
  "8": "Internal Technician",
  "9": "Owner Lead",
};

// "Other" (payoutTypeID 1) carries the real method in otherPayoutTypeID.
export function paymentMethodLabel(payoutTypeID: unknown, otherPayoutTypeID?: unknown): string {
  const t = str(payoutTypeID);
  if (t === "1") return OTHER_PAYOUT_TYPES[str(otherPayoutTypeID)] || "Other";
  return PAYOUT_TYPES[t] || "";
}

export function payeeTypeLabel(id: unknown): string {
  return PAYEE_TYPES[str(id)] || "";
}

// Map check-register rows (the payee's name is `contactName`, not `payee`) to
// our shape, newest first, and total the amount. Pure, so it's unit-tested.
export function mapMoneyOut(rows: ReportRow[]): { rows: MoneyOutRow[]; total: number } {
  const data = rows.filter((r) => r?.rowTypeID === 3 && r.data);
  let total = 0;
  const mapped: MoneyOutRow[] = data.map((r) => {
    const d = r.data!;
    const amount = money(d.payoutAmount);
    total += amount;
    return {
      payoutId: str(d.payoutID),
      bankAccount: cleanAccountName(str(d.bankAccountName)),
      date: str(d.datePosted),
      payee: str(d.contactName),
      payeeType: payeeTypeLabel(d.contactTypeID),
      method: paymentMethodLabel(d.payoutTypeID, d.otherPayoutTypeID),
      checkNumber: str(d.checkNumber),
      memo: str(d.memo),
      amount,
    };
  });
  mapped.sort((a, b) => {
    const ta = Date.parse(a.date);
    const tb = Date.parse(b.date);
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });
  return { rows: mapped, total: Math.round(total * 100) / 100 };
}

export async function fetchMoneyOut(): Promise<MoneyOutResult> {
  if (!isRentvineConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Rentvine isn't configured — set RENTVINE_API_KEY / RENTVINE_API_SECRET.",
    };
  }

  try {
    const rows = await runReport("check-register", {
      displayColumns: [
        "datePosted",
        "payee",
        "payoutTypeID",
        "otherPayoutTypeID",
        "checkNumber",
        "memo",
        "payoutAmount",
        "contactTypeID",
      ],
      orderBys: ["datePosted"],
      filters: [
        { name: "datePosted", comparator: `last${MONEY_OUT_DAYS}Days` },
        { name: "isVoided", comparator: "booleanFalse" },
      ],
    });
    const { rows: mapped, total } = mapMoneyOut(rows);
    return { ok: true, rows: mapped, total, count: mapped.length, asOf: today() };
  } catch (e) {
    return errorResult(e);
  }
}

// The management-company payees whose payments are trust → operating draws
// (overridable via PMI_DRAW_PAYEES, comma-separated).
export const PMI_DRAW_PAYEES: string[] = (
  process.env.PMI_DRAW_PAYEES || "PMI Lighthouse,PMI Lighthouse Reimbursable"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function isDrawPayee(payee: string): boolean {
  const p = payee.trim().toLowerCase();
  return PMI_DRAW_PAYEES.some((n) => n.toLowerCase() === p);
}

// Money-out payments narrowed to the management-company draw payees — the
// Rentvine Transactions tab's trust-draw list. Same Check Register source.
export async function fetchManagementDraws(): Promise<MoneyOutResult> {
  const out = await fetchMoneyOut();
  if (!out.ok) return out;
  const rows = out.rows.filter((r) => isDrawPayee(r.payee));
  const total = Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
  return { ok: true, rows, total, count: rows.length, asOf: out.asOf };
}
