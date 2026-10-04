/**
 * One-time migration: copy invoices + invoice settings from the standalone
 * invoicing Supabase project into PM-Central's single database (Neon/Postgres).
 *
 * Idempotent: upserts by id, so it can be re-run safely (e.g. once for the dev
 * Neon branch and once for prod).
 *
 * Requires in the environment:
 *   DATABASE_URL                   -> the TARGET Neon branch (dev or prod)
 *   INVOICING_SUPABASE_URL         -> the SOURCE invoicing Supabase project
 *   INVOICING_SUPABASE_SERVICE_KEY -> its service_role key
 *
 * Run:  npm run migrate:invoices
 */
import { prisma } from "../src/lib/prisma";
import { getInvoicingSupabase } from "../src/lib/invoicing-supabase";

const BASE =
  "id,number,invoice_date,due_date,period,from_party,bill_to,terms,notes,billing_contact,tax_rate,status,items,billing_party,customer_id,period_key,deleted_at,created_at,updated_at";
const WITH_PROPERTY = `${BASE},property_external_id`;

function toDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function main() {
  const db = getInvoicingSupabase();
  if (!db) {
    throw new Error(
      "Source not configured: set INVOICING_SUPABASE_URL and INVOICING_SUPABASE_SERVICE_KEY."
    );
  }

  // --- Invoices (include soft-deleted so numbers/history carry over) ---------
  let res = await db.from("invoices").select(WITH_PROPERTY);
  if (res.error && (res.error.code === "42703" || /property_external_id/i.test(res.error.message))) {
    res = await db.from("invoices").select(BASE);
  }
  if (res.error) throw new Error(`Reading invoices failed: ${res.error.message}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices = (res.data ?? []) as any[];
  console.log(`Read ${invoices.length} invoices from Supabase.`);

  let done = 0;
  for (const r of invoices) {
    const data = {
      number: r.number,
      invoiceDate: r.invoice_date ?? null,
      dueDate: r.due_date ?? null,
      period: r.period ?? null,
      fromParty: r.from_party ?? null,
      billTo: r.bill_to ?? null,
      terms: r.terms ?? null,
      notes: r.notes ?? null,
      billingContact: r.billing_contact ?? null,
      taxRate: Number(r.tax_rate) || 0,
      status: r.status ?? "draft",
      items: r.items ?? null,
      billingParty: r.billing_party ?? null,
      customerId: r.customer_id ?? null,
      periodKey: r.period_key ?? null,
      propertyExternalId: r.property_external_id ?? null,
      deletedAt: toDate(r.deleted_at),
      createdAt: toDate(r.created_at) ?? new Date(),
      updatedAt: toDate(r.updated_at) ?? new Date(),
    };
    await prisma.invoice.upsert({
      where: { id: r.id },
      create: { id: r.id, ...data },
      update: data,
    });
    done++;
    if (done % 100 === 0) console.log(`  …${done} invoices`);
  }
  console.log(`Upserted ${done} invoices into Neon.`);

  // --- Invoice settings (single row, id = 1) ---------------------------------
  const setRes = await db.from("app_settings").select("settings").eq("id", 1).maybeSingle();
  if (setRes.error) {
    console.warn(`Could not read app_settings: ${setRes.error.message} (skipping settings).`);
  } else if (setRes.data) {
    await prisma.invoiceSetting.upsert({
      where: { id: 1 },
      create: { id: 1, settings: setRes.data.settings ?? {} },
      update: { settings: setRes.data.settings ?? {} },
    });
    console.log("Upserted invoice settings (id = 1).");
  } else {
    console.log("No app_settings row (id = 1) to copy.");
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
