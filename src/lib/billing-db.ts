import { prisma } from "@/lib/prisma";
import type { BilledInvoice } from "@/lib/billing";

// Reads for the Invoicing → Billing / Customers pages. Return null when the
// tables aren't there yet (prisma/sql/invoicing_customers.sql not applied), so
// the page explains that instead of erroring.

export type CustomerRecord = {
  id: string;
  billingParty: string;
  name: string;
  addr: string | null;
  contact: string | null;
  attn: string | null;
  service: string | null;
  rate: number;
  frequency: string;
  startDate: string;
  isActive: boolean;
  rentvinePortfolioId: string | null;
  rentvineContactId: string | null;
  notes: string | null;
};

const CUSTOMER_FIELDS = {
  id: true, billingParty: true, name: true, addr: true, contact: true, attn: true, service: true,
  rate: true, frequency: true, startDate: true, isActive: true, rentvinePortfolioId: true,
  rentvineContactId: true, notes: true,
} as const;

export async function loadCustomers(): Promise<CustomerRecord[] | null> {
  try {
    return await prisma.invoiceCustomer.findMany({ select: CUSTOMER_FIELDS, orderBy: { name: "asc" } });
  } catch {
    return null;
  }
}

export async function loadPeriodInvoices(key: string): Promise<BilledInvoice[]> {
  return prisma.invoice.findMany({
    where: { periodKey: key, customerId: { not: null }, deletedAt: null },
    select: { id: true, number: true, status: true, customerId: true, periodKey: true },
  });
}

// Live invoices per customer, for the Customers list.
export async function invoiceCountsByCustomer(): Promise<Record<string, number>> {
  const rows = await prisma.invoice.groupBy({
    by: ["customerId"],
    where: { customerId: { not: null }, deletedAt: null },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) if (r.customerId) out[r.customerId] = r._count._all;
  return out;
}
