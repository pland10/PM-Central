import { prisma } from "@/lib/prisma";
import type { ReceiptItem } from "@/lib/receipts";

// Reads for Invoicing → Receipts / Properties. null when the tables aren't there
// yet (prisma/sql/invoicing_customers.sql not applied), so pages explain that.

export type ReceiptRecord = {
  id: string;
  number: string;
  billingParty: string;
  inspector: string;
  paidOn: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  items: ReceiptItem[];
};

export type WatchedRecord = {
  id: string;
  address: string;
  label: string | null;
  source: string;
  rentvinePropertyId: string | null;
  isActive: boolean;
};

const RECEIPT_FIELDS = {
  id: true, number: true, billingParty: true, inspector: true, paidOn: true,
  method: true, reference: true, notes: true, items: true,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toReceipt = (r: any): ReceiptRecord => ({ ...r, items: Array.isArray(r.items) ? (r.items as ReceiptItem[]) : [] });

export async function loadReceipts(): Promise<ReceiptRecord[] | null> {
  try {
    const rows = await prisma.inspectorReceipt.findMany({
      where: { deletedAt: null },
      select: RECEIPT_FIELDS,
      orderBy: [{ paidOn: "desc" }, { number: "desc" }],
    });
    return rows.map(toReceipt);
  } catch {
    return null;
  }
}

export async function loadReceipt(id: string): Promise<ReceiptRecord | null> {
  try {
    const r = await prisma.inspectorReceipt.findFirst({ where: { id, deletedAt: null }, select: RECEIPT_FIELDS });
    return r ? toReceipt(r) : null;
  } catch {
    return null;
  }
}

export async function loadWatched(): Promise<WatchedRecord[] | null> {
  try {
    return await prisma.watchedProperty.findMany({
      select: { id: true, address: true, label: true, source: true, rentvinePropertyId: true, isActive: true },
      orderBy: [{ isActive: "desc" }, { address: "asc" }],
    });
  } catch {
    return null;
  }
}
