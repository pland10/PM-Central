/**
 * One-time copy of the rest of the standalone invoicing app into PM-Central:
 * customers (recurring billing), inspector receipts and watched properties.
 * (Invoices + invoice settings were copied earlier by migrate-invoices-to-neon.)
 *
 * Idempotent: upserts by id. Prints counts only (Actions logs are public).
 *
 * Requires: DATABASE_URL (target), INVOICING_SUPABASE_URL +
 * INVOICING_SUPABASE_SERVICE_KEY (the old project, restored).
 * Run:  npm run migrate:invoicing-extras   (or the "Migrate invoicing" workflow)
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { getInvoicingSupabase } from "../src/lib/invoicing-supabase";
import { customerFromOld, receiptFromOld, watchedFromOld } from "../src/lib/invoicing-migrate";

async function readAll(table: string): Promise<Record<string, unknown>[] | null> {
  const db = getInvoicingSupabase()!;
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select("*").range(from, from + 999);
    if (error) {
      // Trimmed: a wrong URL returns a whole HTML page as the "message".
      console.warn(`  ${table}: could not read (${error.code ?? ""} ${String(error.message).slice(0, 160)}) — skipped`);
      return null;
    }
    out.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < 1000) return out;
  }
}

async function main() {
  if (!getInvoicingSupabase()) {
    throw new Error("Source not configured: set INVOICING_SUPABASE_URL and INVOICING_SUPABASE_SERVICE_KEY.");
  }

  const customers = await readAll("customers");
  if (customers) {
    for (const r of customers) {
      const { id, ...data } = customerFromOld(r);
      await prisma.invoiceCustomer.upsert({ where: { id }, create: { id, ...data }, update: data });
    }
    console.log(`Customers: upserted ${customers.length}.`);
  }

  const receipts = await readAll("receipts");
  if (receipts) {
    for (const r of receipts) {
      const { id, items, ...rest } = receiptFromOld(r);
      const data = { ...rest, items: items as Prisma.InputJsonValue };
      await prisma.inspectorReceipt.upsert({ where: { id }, create: { id, ...data }, update: data });
    }
    console.log(`Receipts: upserted ${receipts.length}.`);
  }

  const watched = await readAll("watched_properties");
  if (watched) {
    for (const r of watched) {
      const { id, ...data } = watchedFromOld(r);
      await prisma.watchedProperty.upsert({ where: { id }, create: { id, ...data }, update: data });
    }
    console.log(`Watched properties: upserted ${watched.length}.`);
  }

  // How many already-migrated invoices now point at a known customer.
  const linked = await prisma.invoice.count({ where: { customerId: { not: null } } });
  const ids = new Set((await prisma.invoiceCustomer.findMany({ select: { id: true } })).map((c) => c.id));
  const withCust = await prisma.invoice.findMany({ where: { customerId: { not: null } }, select: { customerId: true } });
  const orphans = withCust.filter((i) => !ids.has(i.customerId!)).length;
  console.log(`Invoices with a customer: ${linked} (${orphans} point at a customer that wasn't found).`);
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
