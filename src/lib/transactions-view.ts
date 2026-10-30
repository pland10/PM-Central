// Pure helpers for the Accounting → Transactions tab, kept out of the React
// component and the route handler so they're unit-tested directly:
//   - summarizeTransactions: the figures for the summary bar at the top.
//   - sanitizeAnnotationPatch: whitelist + normalize the editable per-transaction
//     fields coming off the client before they hit the database.

// Whether a charge is reimbursable. null = not yet reviewed.
export type Reimbursable = "yes" | "no" | null;

// The hand-entered fields on a transaction (everything the sync doesn't own).
export type TxnAnnotation = {
  reimbursable: Reimbursable;
  categoryOverride: string; // the user's own category ("" when unset)
  recordedQuickbooks: boolean; // bookkeeper entered it in QuickBooks
  recordedRentvine: boolean; // recorded in Rentvine
  notes: string;
  propertyId: string | null; // linked property (Property.externalId), null = none
  unitId: string | null; // linked Rentvine unit (rentvine_units.unit_id), null = whole property
};

const NOTES_MAX = 2000;
const CATEGORY_MAX = 120;
const PROPERTY_ID_MAX = 64;

export type TxnSummaryRow = {
  amount: number; // positive = charge/spend, negative = credit (Plaid's sign)
  reimbursable: Reimbursable;
  recordedQuickbooks: boolean;
  recordedRentvine: boolean;
};

export type TxnSummary = {
  count: number;
  totalSpend: number; // sum of positive amounts
  totalCredits: number; // sum of negative amounts, as a positive number
  net: number; // totalSpend − totalCredits
  reimbursableTotal: number; // sum of amount flagged reimbursable
  reimbursableCount: number;
  unreviewedCount: number; // reimbursable not set yet
  pendingQuickbooks: number; // not yet recorded in QuickBooks
  pendingRentvine: number; // not yet recorded in Rentvine
};

export function summarizeTransactions(rows: TxnSummaryRow[]): TxnSummary {
  const s: TxnSummary = {
    count: rows.length,
    totalSpend: 0,
    totalCredits: 0,
    net: 0,
    reimbursableTotal: 0,
    reimbursableCount: 0,
    unreviewedCount: 0,
    pendingQuickbooks: 0,
    pendingRentvine: 0,
  };
  for (const r of rows) {
    if (r.amount >= 0) s.totalSpend += r.amount;
    else s.totalCredits += -r.amount;
    if (r.reimbursable === "yes") {
      s.reimbursableTotal += r.amount;
      s.reimbursableCount += 1;
    } else if (r.reimbursable == null) {
      s.unreviewedCount += 1;
    }
    if (!r.recordedQuickbooks) s.pendingQuickbooks += 1;
    if (!r.recordedRentvine) s.pendingRentvine += 1;
  }
  // Round to cents to shake off floating-point drift from summing.
  const cents = (n: number) => Math.round(n * 100) / 100;
  s.totalSpend = cents(s.totalSpend);
  s.totalCredits = cents(s.totalCredits);
  s.net = cents(s.totalSpend - s.totalCredits);
  s.reimbursableTotal = cents(s.reimbursableTotal);
  return s;
}

export type AnnotationPatch = Partial<TxnAnnotation>;

// Whitelist and normalize an incoming edit. Only keys actually present in the
// body end up in the result, so a PATCH touches exactly the fields the user
// changed. Unknown keys and non-object bodies yield an empty patch.
export function sanitizeAnnotationPatch(body: unknown): AnnotationPatch {
  const out: AnnotationPatch = {};
  if (!body || typeof body !== "object") return out;
  const b = body as Record<string, unknown>;

  if ("reimbursable" in b) {
    out.reimbursable = b.reimbursable === "yes" ? "yes" : b.reimbursable === "no" ? "no" : null;
  }
  if ("categoryOverride" in b) {
    out.categoryOverride =
      typeof b.categoryOverride === "string" ? b.categoryOverride.trim().slice(0, CATEGORY_MAX) : "";
  }
  if ("recordedQuickbooks" in b) out.recordedQuickbooks = Boolean(b.recordedQuickbooks);
  if ("recordedRentvine" in b) out.recordedRentvine = Boolean(b.recordedRentvine);
  if ("propertyId" in b) {
    const id = typeof b.propertyId === "string" ? b.propertyId.trim().slice(0, PROPERTY_ID_MAX) : "";
    out.propertyId = id || null;
  }
  if ("unitId" in b) {
    const id = typeof b.unitId === "string" ? b.unitId.trim().slice(0, PROPERTY_ID_MAX) : "";
    out.unitId = id || null;
  }
  if ("notes" in b) {
    out.notes = typeof b.notes === "string" ? b.notes.slice(0, NOTES_MAX) : "";
  }
  return out;
}
