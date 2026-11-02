import { requireFeature } from "@/config/features";
import { billingRun, currentPeriodKey, isPeriodKey } from "@/lib/billing";
import { loadCustomers, loadPeriodInvoices } from "@/lib/billing-db";
import { InvoicingTabs } from "../InvoicingTabs";
import { BillingView } from "./BillingView";
import { SetupNeeded } from "../customers/SetupNeeded";

// Billing run: who is due this month, who has been invoiced, and a button to
// raise the missing invoices. Ported from the standalone invoicing app.
export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  requireFeature("invoicing");
  const { period } = await searchParams;
  const key = isPeriodKey(period) ? period : currentPeriodKey();

  const customers = await loadCustomers();
  if (!customers) {
    return (
      <div>
        <InvoicingTabs />
        <SetupNeeded />
      </div>
    );
  }
  const run = billingRun(customers, await loadPeriodInvoices(key), key);

  return (
    <div>
      <InvoicingTabs />
      <BillingView
        periodKey={key}
        rows={run.rows.map((r) => ({
          customerId: r.customer.id,
          name: r.customer.name,
          billingParty: r.customer.billingParty,
          service: r.customer.service ?? "",
          rate: r.customer.rate,
          invoice: r.invoice ? { id: r.invoice.id, number: r.invoice.number, status: r.invoice.status } : null,
        }))}
        expected={run.expected}
        hasCustomers={customers.length > 0}
      />
    </div>
  );
}
