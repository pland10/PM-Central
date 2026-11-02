// Row mappers for the one-time copy out of the standalone invoicing Supabase
// project (snake_case) into PM-Central's Prisma models. Ids are kept, so the
// already-migrated invoices' customerId still points at the right customer.
// Used by scripts/migrate-invoicing-extras.ts.

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const date = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};
const day = (v: unknown): string => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : new Date().toISOString().slice(0, 10);
};

export function customerFromOld(r: Row) {
  return {
    id: String(r.id),
    billingParty: str(r.billing_party) ?? "pmi",
    name: str(r.name) ?? "(unnamed)",
    addr: str(r.addr),
    contact: str(r.contact),
    attn: str(r.attn),
    service: str(r.service),
    rate: Number(r.rate) || 0,
    frequency: str(r.frequency) ?? "monthly",
    startDate: day(r.start_date),
    isActive: r.is_active !== false,
    rentvinePortfolioId: str(r.rentvine_portfolio_id),
    rentvineContactId: str(r.rentvine_contact_id),
    notes: str(r.notes),
    createdAt: date(r.created_at) ?? new Date(),
  };
}

export function receiptFromOld(r: Row) {
  return {
    id: String(r.id),
    number: String(r.number),
    billingParty: str(r.billing_party) ?? "pmi",
    inspector: str(r.inspector) ?? "",
    paidOn: day(r.paid_on),
    method: str(r.method),
    reference: str(r.reference),
    notes: str(r.notes),
    items: Array.isArray(r.items) ? (r.items as unknown[]) : [],
    deletedAt: date(r.deleted_at),
    createdAt: date(r.created_at) ?? new Date(),
  };
}

export function watchedFromOld(r: Row) {
  return {
    id: String(r.id),
    address: str(r.address) ?? "",
    label: str(r.label),
    source: str(r.source) ?? "manual",
    rentvinePropertyId: str(r.rentvine_property_id),
    rentvinePortfolioId: str(r.rentvine_portfolio_id),
    isActive: r.is_active !== false,
    notes: str(r.notes),
    createdAt: date(r.created_at) ?? new Date(),
  };
}
