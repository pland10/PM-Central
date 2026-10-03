import { requireFeature } from "@/config/features";
import { getInvoicingSupabase } from "@/lib/invoicing-supabase";
import type { InvoiceRow } from "@/lib/invoices";
import { InvoicingTable } from "./InvoicingTable";
import { NewInvoiceButton } from "./NewInvoiceButton";

// Native Invoicing over the live invoicing Supabase project (service key stays
// server-side). Create / edit / status / print happen here; the standalone app
// remains available as a fallback on the same database.
export const dynamic = "force-dynamic";

export default async function InvoicingPage() {
  requireFeature("invoicing");

  const db = getInvoicingSupabase();

  if (!db) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <h1 className="mb-2 text-base font-semibold">Invoicing isn’t configured yet</h1>
        <p className="mb-3">
          The native Invoicing view reads the live invoicing database directly. To
          turn it on, set these on the server (they stay server-side and are never
          sent to the browser):
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <code className="rounded bg-amber-100 px-1">INVOICING_SUPABASE_URL</code>
          </li>
          <li>
            <code className="rounded bg-amber-100 px-1">INVOICING_SUPABASE_SERVICE_KEY</code>{" "}
            — the invoicing project’s <em>service_role</em> key
          </li>
        </ul>
      </div>
    );
  }

  const { data, error } = await db
    .from("invoices")
    .select(
      "id,number,invoice_date,due_date,period,from_party,bill_to,terms,notes,billing_contact,tax_rate,status,items,billing_party,customer_id,period_key,deleted_at,created_at,updated_at"
    )
    .is("deleted_at", null)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-900">
        <h1 className="mb-2 text-base font-semibold">Couldn’t load invoices</h1>
        <p className="mb-2">The invoicing database returned an error:</p>
        <pre className="whitespace-pre-wrap rounded bg-red-100 p-2 text-xs">{error.message}</pre>
      </div>
    );
  }

  const rows = (data ?? []) as InvoiceRow[];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Invoicing</h1>
          <p className="text-sm text-slate-500">Live invoicing records.</p>
        </div>
        <NewInvoiceButton />
      </div>
      <InvoicingTable rows={rows} />
    </div>
  );
}
