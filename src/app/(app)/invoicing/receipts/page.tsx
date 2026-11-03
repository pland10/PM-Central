import { requireFeature } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { loadReceipts } from "@/lib/receipts-db";
import { InvoicingTabs } from "../InvoicingTabs";
import { SetupNeeded } from "../customers/SetupNeeded";
import { ReceiptsList } from "./ReceiptsList";

// Inspector receipts: proof a Squatter Watch inspector was paid for the visits
// listed (money out — separate from invoices).
export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  requireFeature("invoicing");
  const [receipts, user] = await Promise.all([loadReceipts(), getCurrentUser()]);
  return (
    <div>
      <InvoicingTabs />
      {receipts ? <ReceiptsList receipts={receipts} isAdmin={!user || user.role === "admin"} /> : <SetupNeeded />}
    </div>
  );
}
