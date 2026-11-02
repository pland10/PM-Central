// Recurring billing ("did we bill them for September?"), ported from the
// standalone invoicing app. Pure — no DB — so the server pages, the API and the
// tests share one definition of who is due and what their invoice looks like.
//
// A billing period is a 'YYYY-MM' key. Quarterly and annual customers key off
// the month their period starts in, so every invoice has exactly one key and
// "one invoice per customer per period" means the same thing for everyone.
import { partyOf } from "@/config/invoicing-parties";

export type BillingFrequency = "monthly" | "quarterly" | "annual" | "none";
export const FREQUENCIES: { value: BillingFrequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "none", label: "One-off" },
];

export type BillingCustomer = {
  id: string;
  billingParty: string;
  name: string;
  addr?: string | null;
  contact?: string | null;
  attn?: string | null;
  service?: string | null;
  rate: number;
  frequency: string;
  startDate: string; // 'YYYY-MM-DD'
  isActive: boolean;
};

export type BilledInvoice = {
  id: string;
  number: string;
  status: string;
  customerId: string | null;
  periodKey: string | null;
};

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isPeriodKey = (k: unknown): k is string => typeof k === "string" && PERIOD_RE.test(k);

// The current billing month in the business timezone (New York).
export function currentPeriodKey(now: number = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit" })
    .formatToParts(new Date(now));
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
}

export function periodLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function monthsBetween(startISO: string, key: string): number {
  const s = startISO.split("-").map(Number);
  const p = key.split("-").map(Number);
  if (s.length < 2 || p.length < 2 || s.some(Number.isNaN) || p.some(Number.isNaN)) return -1;
  return (p[0] - s[0]) * 12 + (p[1] - s[1]);
}

// Is this customer due to be billed for this period?
export function dueInPeriod(c: BillingCustomer, key: string): boolean {
  if (!c.isActive || c.frequency === "none") return false;
  const n = monthsBetween(c.startDate, key);
  if (n < 0) return false; // the period predates the agreement
  if (c.frequency === "monthly") return true;
  if (c.frequency === "quarterly") return n % 3 === 0;
  if (c.frequency === "annual") return n % 12 === 0;
  return false;
}

export type BillingRun<C extends BillingCustomer, I extends BilledInvoice> = {
  rows: { customer: C; invoice: I | null }[];
  missing: C[];
  expected: number;
};

// Everyone due in `key`, each with their invoice for that period (or null).
export function billingRun<C extends BillingCustomer, I extends BilledInvoice>(
  customers: C[],
  invoices: I[],
  key: string
): BillingRun<C, I> {
  const byCustomer = new Map<string, I>();
  for (const inv of invoices) {
    if (inv.customerId && inv.periodKey === key) byCustomer.set(inv.customerId, inv);
  }
  const rows = customers
    .filter((c) => dueInPeriod(c, key))
    .map((customer) => ({ customer, invoice: byCustomer.get(customer.id) ?? null }));
  return {
    rows,
    missing: rows.filter((r) => !r.invoice).map((r) => r.customer),
    expected: rows.reduce((s, r) => s + (Number(r.customer.rate) || 0), 0),
  };
}

function termDays(terms: string): number {
  const m = /(\d+)/.exec(terms);
  return m ? Number(m[1]) : 30;
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type BillingSettings = {
  terms?: string;
  taxRate?: number;
  notesByParty?: Record<string, string>;
};

// The invoice for one customer for one period, priced from their record
// (everything but the number, which the API allocates).
export function invoiceDraftForCustomer(c: BillingCustomer, key: string, settings: BillingSettings, today: string) {
  const terms = settings.terms || "Net 30";
  const party = partyOf(c.billingParty);
  const service = c.service?.trim() || "Services";
  return {
    billingParty: party.key,
    customerId: c.id,
    periodKey: key,
    invoiceDate: today,
    dueDate: addDays(today, termDays(terms)),
    period: `${service} — ${periodLabel(key)}`,
    fromParty: party.from,
    billTo: { name: c.name, addr: c.addr ?? "", contact: c.contact ?? "", extra: c.attn ?? "" },
    terms,
    notes: settings.notesByParty?.[party.key]?.trim() || party.notes,
    billingContact: null,
    taxRate: Number(settings.taxRate) || 0,
    status: "draft",
    items: [{ desc: service, qty: 1, rate: Number(c.rate) || 0 }],
  };
}
