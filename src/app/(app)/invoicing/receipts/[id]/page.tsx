import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeature } from "@/config/features";
import { loadReceipt, loadWatched } from "@/lib/receipts-db";
import { InvoicingTabs } from "../../InvoicingTabs";
import { ReceiptEditor } from "./ReceiptEditor";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  requireFeature("invoicing");
  const { id } = await params;
  const [receipt, watched] = await Promise.all([loadReceipt(id), loadWatched()]);
  if (!receipt) notFound();
  return (
    <div>
      <InvoicingTabs />
      <Link href="/invoicing/receipts" className="mb-3 inline-block text-sm text-slate-500 hover:text-slate-700">
        ← Receipts
      </Link>
      <ReceiptEditor
        receipt={receipt}
        addresses={(watched ?? []).filter((w) => w.isActive).map((w) => w.address)}
      />
    </div>
  );
}
