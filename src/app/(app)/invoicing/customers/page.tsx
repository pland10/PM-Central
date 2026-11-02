import { requireFeature } from "@/config/features";
import { invoiceCountsByCustomer, loadCustomers } from "@/lib/billing-db";
import { InvoicingTabs } from "../InvoicingTabs";
import { CustomersView } from "./CustomersView";
import { SetupNeeded } from "./SetupNeeded";

// Recurring-billing customers: who is billed, for what, at what rate and how
// often. The Billing tab raises their invoices each period.
export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  requireFeature("invoicing");
  const customers = await loadCustomers();
  return (
    <div>
      <InvoicingTabs />
      {customers ? (
        <CustomersView customers={customers} invoiceCounts={await invoiceCountsByCustomer()} />
      ) : (
        <SetupNeeded />
      )}
    </div>
  );
}
