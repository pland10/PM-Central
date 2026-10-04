import { prisma } from "@/lib/prisma";
import type {
  InvoiceRow,
  InvoiceStatus,
  InvoiceParty,
  InvoiceItem,
} from "@/lib/invoices";

// Invoice data access over PM-Central's single database (Prisma/Postgres).
// Invoicing used to live in a separate Supabase project; it now lives here, so
// it shares the app DB's dev/prod branch isolation. The app speaks the original
// snake_case `InvoiceRow` shape, so we map Prisma's camelCase rows to it here.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toInvoiceRow(inv: any): InvoiceRow {
  return {
    id: inv.id,
    number: inv.number,
    invoice_date: inv.invoiceDate ?? null,
    due_date: inv.dueDate ?? null,
    period: inv.period ?? null,
    from_party: (inv.fromParty ?? null) as InvoiceParty | null,
    bill_to: (inv.billTo ?? null) as InvoiceParty | null,
    terms: inv.terms ?? null,
    notes: inv.notes ?? null,
    billing_contact: inv.billingContact ?? null,
    tax_rate: inv.taxRate ?? null,
    status: inv.status as InvoiceStatus,
    items: (inv.items ?? null) as InvoiceItem[] | null,
    billing_party: inv.billingParty ?? null,
    customer_id: inv.customerId ?? null,
    period_key: inv.periodKey ?? null,
    property_external_id: inv.propertyExternalId ?? null,
    deleted_at: inv.deletedAt ? inv.deletedAt.toISOString() : null,
    created_at: inv.createdAt ? inv.createdAt.toISOString() : null,
    updated_at: inv.updatedAt ? inv.updatedAt.toISOString() : null,
  };
}

export async function loadInvoices(): Promise<InvoiceRow[]> {
  const rows = await prisma.invoice.findMany({
    where: { deletedAt: null },
    orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
    take: 2000,
  });
  return rows.map(toInvoiceRow);
}

export async function loadInvoiceById(id: string): Promise<InvoiceRow | null> {
  const inv = await prisma.invoice.findUnique({ where: { id } });
  return inv ? toInvoiceRow(inv) : null;
}

// Invoices linked to a given property (by the property's stable externalId).
export async function loadInvoicesForProperty(
  propertyExternalId: string | null
): Promise<InvoiceRow[]> {
  if (!propertyExternalId) return [];
  const rows = await prisma.invoice.findMany({
    where: { propertyExternalId, deletedAt: null },
    orderBy: [{ invoiceDate: "desc" }],
    take: 50,
  });
  return rows.map(toInvoiceRow);
}
