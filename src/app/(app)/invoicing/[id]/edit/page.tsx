import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeature } from "@/config/features";
import { getInvoicingSupabase } from "@/lib/invoicing-supabase";
import type { InvoiceRow } from "@/lib/invoices";
import { InvoiceEditor } from "./InvoiceEditor";

export const dynamic = "force-dynamic";

export default async function InvoiceEditPage({ params }: { params: Promise<{ id: string }> }) {
  requireFeature("invoicing");
  const { id } = await params;

  const db = getInvoicingSupabase();
  if (!db) notFound();

  const { data, error } = await db
    .from("invoices")
    .select(
      "id,number,invoice_date,due_date,period,from_party,bill_to,terms,notes,billing_contact,tax_rate,status,items,billing_party,customer_id,period_key,deleted_at,created_at,updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();
  const invoice = data as InvoiceRow;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/invoicing" className="text-sm text-slate-500 hover:text-brand-600">
        ← All invoices
      </Link>
      <InvoiceEditor initial={invoice} />
    </div>
  );
}
