import { requireFeature } from "@/config/features";
import { loadInvoices } from "@/lib/invoicing-query";
import { propertyLabelMap } from "@/lib/property-options";
import { InvoicingTable } from "./InvoicingTable";
import { NewInvoiceButton } from "./NewInvoiceButton";

// Native Invoicing over PM-Central's single database (Prisma/Postgres). Create /
// edit / status / print all happen here.
export const dynamic = "force-dynamic";

export default async function InvoicingPage() {
  requireFeature("invoicing");

  const [rows, propertyLabels] = await Promise.all([loadInvoices(), propertyLabelMap()]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Invoicing</h1>
          <p className="text-sm text-slate-500">Invoice records.</p>
        </div>
        <NewInvoiceButton />
      </div>
      <InvoicingTable rows={rows} propertyLabels={propertyLabels} />
    </div>
  );
}
