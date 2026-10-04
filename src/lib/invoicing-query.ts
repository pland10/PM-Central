import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvoiceRow } from "@/lib/invoices";

// Server-side invoice loaders over the live invoicing Supabase project.
//
// These centralize the column list and, importantly, degrade gracefully if the
// `property_external_id` column hasn't been added yet (see DEPLOY.md / the SQL
// in the invoice→property change): a read that references a missing column is
// retried without it, so linking invoices to properties can never break the
// actively-used invoicing views before the migration runs.

const BASE_FIELDS =
  "id,number,invoice_date,due_date,period,from_party,bill_to,terms,notes,billing_contact,tax_rate,status,items,billing_party,customer_id,period_key,deleted_at,created_at,updated_at";
const FIELDS_WITH_PROPERTY = `${BASE_FIELDS},property_external_id`;

// Postgres 42703 = undefined_column. Supabase/PostgREST may surface it as the
// code, or only name the column in the message, so check both.
function isMissingPropertyColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42703" || /property_external_id/i.test(err.message ?? "");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(row: any): InvoiceRow {
  return { ...row, property_external_id: row?.property_external_id ?? null } as InvoiceRow;
}

export async function loadInvoiceById(
  db: SupabaseClient,
  id: string
): Promise<InvoiceRow | null> {
  let res = await db.from("invoices").select(FIELDS_WITH_PROPERTY).eq("id", id).maybeSingle();
  if (res.error && isMissingPropertyColumn(res.error)) {
    res = await db.from("invoices").select(BASE_FIELDS).eq("id", id).maybeSingle();
  }
  if (res.error || !res.data) return null;
  return normalize(res.data);
}

export async function loadInvoices(
  db: SupabaseClient
): Promise<{ rows: InvoiceRow[]; error: string | null }> {
  const build = (fields: string) =>
    db
      .from("invoices")
      .select(fields)
      .is("deleted_at", null)
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2000);

  let res = await build(FIELDS_WITH_PROPERTY);
  if (res.error && isMissingPropertyColumn(res.error)) res = await build(BASE_FIELDS);
  if (res.error) return { rows: [], error: res.error.message };
  return { rows: (res.data ?? []).map(normalize), error: null };
}

// Invoices linked to a given property (by the property's stable externalId).
// Returns [] when the column doesn't exist yet or nothing matches, so the
// property page never errors on account of invoicing.
export async function loadInvoicesForProperty(
  db: SupabaseClient,
  propertyExternalId: string | null
): Promise<InvoiceRow[]> {
  if (!propertyExternalId) return [];
  const res = await db
    .from("invoices")
    .select(FIELDS_WITH_PROPERTY)
    .eq("property_external_id", propertyExternalId)
    .is("deleted_at", null)
    .order("invoice_date", { ascending: false })
    .limit(50);
  if (res.error) return [];
  return (res.data ?? []).map(normalize);
}
