import type { TxnRow } from "@/lib/plaid-db";
import { sanitizeAnnotationPatch, type Reimbursable } from "@/lib/transactions-view";

// Splitting one bank/card charge into lines — a header (the charge itself:
// date, account, merchant, total; owned by the sync) and lines that each carry
// their own amount, property/unit, category, reimbursable and recorded flags,
// like a GL entry. Stored in transaction_splits (src/lib/plaid-sync.ts). The
// page shows a split charge as one row per line, so totals, filters, export
// and the Billed-in-Rentvine check all work per line. Pure helpers here.

export type SplitLine = {
  amount: number;
  reimbursable: Reimbursable;
  categoryOverride: string;
  recordedQuickbooks: boolean;
  recordedRentvine: boolean;
  propertyId: string | null;
  unitId: string | null;
};
export type StoredSplitLine = SplitLine & { id: number };

export type SplitInfo = {
  lineId: number;
  lineNo: number; // 1-based
  count: number;
  total: number; // the charge's amount
  balanced: boolean; // lines still add up to the charge
};

export const MAX_SPLIT_LINES = 25;

const cents = (n: number) => Math.round(n * 100);
const money = (c: number) =>
  `$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Validate + normalize the lines coming off the client. The lines must add up
// to the charge to the cent; each line's fields go through the same whitelist
// as a normal row edit.
export function sanitizeSplitLines(input: unknown, total: number): { lines: SplitLine[] } | { error: string } {
  if (!Array.isArray(input) || input.length < 2) return { error: "A split needs at least two lines." };
  if (input.length > MAX_SPLIT_LINES) return { error: `A split can have at most ${MAX_SPLIT_LINES} lines.` };
  const lines: SplitLine[] = [];
  for (const raw of input) {
    const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const amount = typeof o.amount === "number" ? o.amount : typeof o.amount === "string" ? Number(o.amount) : NaN;
    if (!Number.isFinite(amount) || cents(amount) === 0) return { error: "Every line needs an amount." };
    const p = sanitizeAnnotationPatch(o);
    const propertyId = p.propertyId ?? null;
    lines.push({
      amount: cents(amount) / 100,
      reimbursable: p.reimbursable ?? null,
      categoryOverride: p.categoryOverride ?? "",
      recordedQuickbooks: p.recordedQuickbooks ?? false,
      recordedRentvine: p.recordedRentvine ?? false,
      propertyId,
      unitId: propertyId ? (p.unitId ?? null) : null,
    });
  }
  const sum = lines.reduce((s, l) => s + cents(l.amount), 0);
  const want = cents(total);
  if (sum !== want) {
    const diff = want - sum;
    return {
      error: `The lines add up to ${money(sum)} — ${money(diff)} ${diff > 0 ? "short of" : "over"} the ${money(want)} charge.`,
    };
  }
  return { lines };
}

// The id a table row is addressed by: "<transactionId>#<lineId>" for a split
// line, the transaction id otherwise.
export const rowIdOf = (r: { transactionId: string; rowId?: string }) => r.rowId ?? r.transactionId;

export function parseRowId(rowId: string): { transactionId: string; lineId: number | null } {
  const m = /^(.+)#(\d+)$/.exec(rowId);
  return m ? { transactionId: m[1], lineId: Number(m[2]) } : { transactionId: rowId, lineId: null };
}

// A split charge → one row per line (the line's amount + fields on the
// charge's date/account/merchant). Unsplit charges pass through untouched.
export function expandSplitRows(rows: TxnRow[], splits: Record<string, StoredSplitLine[]>): TxnRow[] {
  const out: TxnRow[] = [];
  for (const r of rows) {
    const lines = splits[r.transactionId];
    if (!lines || lines.length === 0) {
      out.push(r);
      continue;
    }
    const balanced = lines.reduce((s, l) => s + cents(l.amount), 0) === cents(r.amount);
    lines.forEach((l, i) => {
      out.push({
        ...r,
        rowId: `${r.transactionId}#${l.id}`,
        amount: l.amount,
        reimbursable: l.reimbursable,
        categoryOverride: l.categoryOverride,
        recordedQuickbooks: l.recordedQuickbooks,
        recordedRentvine: l.recordedRentvine,
        propertyId: l.propertyId,
        unitId: l.unitId,
        split: { lineId: l.id, lineNo: i + 1, count: lines.length, total: r.amount, balanced },
      });
    });
  }
  return out;
}
