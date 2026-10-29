// Server-only: Plaid Manager helpers for the Accounting → Transactions tab.
//
// Talks to Plaid's REST API directly (no SDK dependency, same as the other
// integrations) using credentials from the environment:
//   PLAID_CLIENT_ID / PLAID_SECRET / PLAID_ENV  (sandbox | production)
//
// The daily sync (scripts/sync-plaid.ts) pulls transactions via
// /transactions/sync and upserts them into plaid_transactions (see
// prisma/sql/plaid.sql). This module holds the API plumbing and the pure
// transaction-normalizer, which is what the tests target.

export type PlaidRawTransaction = {
  transaction_id?: string;
  account_id?: string;
  name?: string;
  merchant_name?: string | null;
  amount?: number | string | null;
  iso_currency_code?: string | null;
  date?: string | null;
  authorized_date?: string | null;
  payment_channel?: string | null;
  pending?: boolean;
  personal_finance_category?: { primary?: string | null; detailed?: string | null } | null;
};

export type TransactionRow = {
  transactionId: string;
  accountId: string;
  accountName: string;
  name: string;
  merchantName: string;
  amount: number;
  isoCurrencyCode: string;
  postedDate: string | null;
  authorizedDate: string | null;
  category: string;
  categoryDetail: string;
  paymentChannel: string;
  pending: boolean;
};

export type SyncResult = {
  added: PlaidRawTransaction[];
  modified: PlaidRawTransaction[];
  removed: string[]; // transaction_ids
  cursor: string;
};

const PLAID_HOSTS: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  production: "https://production.plaid.com",
};

export function isPlaidConfigured(): boolean {
  return Boolean((process.env.PLAID_CLIENT_ID || "") && (process.env.PLAID_SECRET || ""));
}

export function plaidBaseUrl(): string {
  const env = (process.env.PLAID_ENV || "sandbox").trim().toLowerCase();
  return PLAID_HOSTS[env] || PLAID_HOSTS.sandbox;
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

// POST to a Plaid endpoint with the credentials in the body (Plaid's scheme).
// Throws an Error carrying `status` on a non-2xx response so callers can map it.
export async function plaidPost<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${plaidBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID || "",
      secret: process.env.PLAID_SECRET || "",
      ...body,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Plaid ${path} failed (HTTP ${res.status}). ${text.slice(0, 300)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

// Map one raw Plaid transaction to our row shape. `accountNames` resolves a
// Plaid account_id to a friendly name (falls back to the id).
export function normalizeTransaction(
  raw: PlaidRawTransaction,
  accountNames: Record<string, string> = {}
): TransactionRow {
  const accountId = str(raw.account_id);
  return {
    transactionId: str(raw.transaction_id),
    accountId,
    accountName: accountNames[accountId] || accountId,
    name: str(raw.name),
    merchantName: str(raw.merchant_name) || str(raw.name),
    amount: num(raw.amount),
    isoCurrencyCode: str(raw.iso_currency_code) || "USD",
    postedDate: raw.date ? str(raw.date) : null,
    authorizedDate: raw.authorized_date ? str(raw.authorized_date) : null,
    category: str(raw.personal_finance_category?.primary),
    categoryDetail: str(raw.personal_finance_category?.detailed),
    paymentChannel: str(raw.payment_channel),
    pending: Boolean(raw.pending),
  };
}

// Drain /transactions/sync for one item, following the cursor until has_more is
// false. Returns the accumulated adds/mods/removes and the final cursor to
// persist. Starts from `cursor` (empty string = full history on first sync).
export async function syncTransactions(accessToken: string, cursor = ""): Promise<SyncResult> {
  const added: PlaidRawTransaction[] = [];
  const modified: PlaidRawTransaction[] = [];
  const removed: string[] = [];
  let next = cursor;
  // Safety bound so a pathological has_more loop can't run forever.
  for (let page = 0; page < 500; page++) {
    const data = await plaidPost<{
      added?: PlaidRawTransaction[];
      modified?: PlaidRawTransaction[];
      removed?: { transaction_id?: string }[];
      next_cursor?: string;
      has_more?: boolean;
    }>("/transactions/sync", { access_token: accessToken, cursor: next, count: 500 });
    added.push(...(data.added || []));
    modified.push(...(data.modified || []));
    removed.push(...(data.removed || []).map((r) => str(r.transaction_id)).filter(Boolean));
    next = str(data.next_cursor) || next;
    if (!data.has_more) break;
  }
  return { added, modified, removed, cursor: next };
}
