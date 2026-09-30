// Shared invoice types + total math. Pure (no secrets, no server-only deps) so
// both the server page and the client table can import it. Mirrors exactly how
// the standalone invoicing app computes a line and an invoice total:
//   lineAmount = qty * rate
//   subtotal   = sum(lineAmount)
//   tax        = subtotal * (tax_rate / 100)   // tax_rate is a percentage
//   total      = subtotal + tax

export type InvoiceStatus = "draft" | "sent" | "paid";

export type InvoiceParty = {
  name?: string;
  addr?: string;
  contact?: string;
  extra?: string;
};

export type InvoiceItem = {
  desc?: string;
  qty?: number | string;
  rate?: number | string;
};

// Shape of a row as stored in the invoicing Supabase `invoices` table.
export type InvoiceRow = {
  id: string;
  number: string;
  invoice_date: string | null;
  due_date: string | null;
  period: string | null;
  from_party: InvoiceParty | null;
  bill_to: InvoiceParty | null;
  terms: string | null;
  notes: string | null;
  billing_contact: string | null;
  tax_rate: number | string | null;
  status: InvoiceStatus;
  items: InvoiceItem[] | null;
  created_at: string | null;
  updated_at: string | null;
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export function lineAmount(item: InvoiceItem): number {
  return num(item.qty) * num(item.rate);
}

export type InvoiceTotals = { subtotal: number; tax: number; total: number };

export function invoiceTotals(
  items: InvoiceItem[] | null | undefined,
  taxRate: number | string | null | undefined
): InvoiceTotals {
  const subtotal = (items ?? []).reduce((sum, it) => sum + lineAmount(it), 0);
  const tax = subtotal * (num(taxRate) / 100);
  return { subtotal, tax, total: subtotal + tax };
}

export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  // invoice_date / due_date are plain 'YYYY-MM-DD' — parse as local, not UTC,
  // so the day doesn't slip across a timezone boundary.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
