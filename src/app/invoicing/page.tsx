import { requireFeature } from "@/config/features";
import { getInvoicingSupabase } from "@/lib/invoicing-supabase";
import type { InvoiceRow } from "@/lib/invoices";
import { InvoicingTable } from "./InvoicingTable";

// Native, READ-ONLY Invoicing view. Reads the live invoicing Supabase project
// server-side (keys never reach the browser) and renders the same data the
// standalone invoicing app shows. Nothing here writes — the standalone app
// remains the only thing that creates, edits, or sends invoices.
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
      "id,number,invoice_date,due_date,period,from_party,bill_to,terms,notes,billing_contact,tax_rate,status,items,created_at,updated_at"
    )
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
          <p className="text-sm text-slate-500">
            Read-only view of the live invoicing records.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
          Read-only
        </span>
      </div>
      <InvoicingTable rows={rows} />
    </div>
  );
}
