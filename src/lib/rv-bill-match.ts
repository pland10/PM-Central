import { rentvinePropertyId } from "@/lib/rentvine-ids";

// "Has this bank charge been billed to the owner in Rentvine?" — for the
// Accounting → Bank Transactions tab. Pure, so it's unit-tested directly.
//
// Rentvine posts every bill line as its own transaction (type 7, "Bill
// Charge") on the owner's ledger, with the property and the exact amount. The
// team bills reimbursable card charges at cost (the 10% markup goes on a
// separate "PMI Lighthouse" bill), so a card charge shows up in Rentvine as a
// bill line of the same amount — or, when one charge covered several
// properties, as a whole bill whose lines add up to it.
//
// The server works out each transaction's candidates (amount + date window);
// the page classifies them against whichever property is tagged right now, so
// changing the property re-checks instantly.

export type RvBillLine = {
  transactionId: string;
  billId: string;
  propertyRvId: string; // bare Rentvine property id
  amount: number;
  date: string; // YYYY-MM-DD posted
  description: string;
  payee: string;
  reference: string;
};

export type RvCandidate = {
  kind: "line" | "bill"; // one bill line, or a whole multi-line bill
  billId: string;
  amount: number;
  date: string;
  description: string;
  payee: string;
  reference: string;
  properties: string[]; // bare Rentvine property ids on the line / bill
};

export type BillIndex = {
  lines: Map<number, RvBillLine[]>; // by amount in cents
  bills: Map<number, RvCandidate[]>; // multi-line bills, by total in cents
};

// A bill is usually entered within days of the card charge, sometimes weeks
// later; rarely before (pre-billed). Generous so a late bill still matches.
const DAYS_BEFORE = 14;
const DAYS_AFTER = 120;
const DAY_MS = 86_400_000;

const cents = (n: number) => Math.round(n * 100);

export function buildBillIndex(lines: RvBillLine[]): BillIndex {
  const byAmount = new Map<number, RvBillLine[]>();
  const byBill = new Map<string, RvBillLine[]>();
  for (const l of lines) {
    const k = cents(l.amount);
    byAmount.set(k, [...(byAmount.get(k) ?? []), l]);
    byBill.set(l.billId, [...(byBill.get(l.billId) ?? []), l]);
  }
  const bills = new Map<number, RvCandidate[]>();
  for (const [billId, ls] of byBill) {
    if (ls.length < 2) continue; // a one-line bill is already a line candidate
    const total = ls.reduce((s, l) => s + cents(l.amount), 0);
    const first = ls[0];
    const cand: RvCandidate = {
      kind: "bill",
      billId,
      amount: total / 100,
      date: ls.map((l) => l.date).sort()[0],
      description: `${ls.length} lines — ${first.description}`,
      payee: first.payee,
      reference: first.reference,
      properties: [...new Set(ls.map((l) => l.propertyRvId))],
    };
    bills.set(total, [...(bills.get(total) ?? []), cand]);
  }
  return { lines: byAmount, bills };
}

function inWindow(chargeDate: string, billDate: string): boolean {
  const c = Date.parse(chargeDate);
  const b = Date.parse(billDate);
  if (Number.isNaN(c) || Number.isNaN(b)) return false;
  return b >= c - DAYS_BEFORE * DAY_MS && b <= c + DAYS_AFTER * DAY_MS;
}

export function candidatesFor(
  txn: { amount: number; postedDate: string | null },
  idx: BillIndex
): RvCandidate[] {
  if (!(txn.amount > 0) || !txn.postedDate) return [];
  const k = cents(txn.amount);
  const out: RvCandidate[] = [];
  for (const l of idx.lines.get(k) ?? []) {
    if (!inWindow(txn.postedDate, l.date)) continue;
    out.push({
      kind: "line",
      billId: l.billId,
      amount: l.amount,
      date: l.date,
      description: l.description,
      payee: l.payee,
      reference: l.reference,
      properties: [l.propertyRvId],
    });
  }
  for (const b of idx.bills.get(k) ?? []) if (inWindow(txn.postedDate, b.date)) out.push(b);
  // Closest to the charge date first.
  const t = Date.parse(txn.postedDate);
  return out.sort((a, b) => Math.abs(Date.parse(a.date) - t) - Math.abs(Date.parse(b.date) - t));
}

export type BillingStatus =
  | { status: "billed"; match: RvCandidate; candidates: RvCandidate[] }
  | { status: "possible"; candidates: RvCandidate[] }
  | { status: "not_found"; candidates: [] };

// By property: "billed" only when a candidate is on the transaction's tagged
// property. Without a property — or when the amount was billed elsewhere —
// it's a "possible" match to confirm by eye. null = no status to show (a
// credit, or the bill sync hasn't run so there are no candidates at all).
export function classifyBilling(r: {
  amount: number;
  propertyId: string | null; // Property.externalId (namespaced)
  candidates: RvCandidate[] | undefined;
}): BillingStatus | null {
  if (!(r.amount > 0) || r.candidates === undefined) return null;
  const cands = r.candidates;
  if (cands.length === 0) return { status: "not_found", candidates: [] };
  if (r.propertyId) {
    const rv = rentvinePropertyId(r.propertyId);
    const match = cands.find((c) => c.properties.includes(rv));
    if (match) return { status: "billed", match, candidates: cands };
  }
  return { status: "possible", candidates: cands };
}
