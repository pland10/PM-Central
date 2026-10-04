import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeature } from "@/config/features";
import { loadInvoiceById } from "@/lib/invoicing-query";
import { listPropertyOptions } from "@/lib/property-options";
import { InvoiceEditor } from "./InvoiceEditor";

export const dynamic = "force-dynamic";

export default async function InvoiceEditPage({ params }: { params: Promise<{ id: string }> }) {
  requireFeature("invoicing");
  const { id } = await params;

  const [invoice, properties] = await Promise.all([
    loadInvoiceById(id),
    listPropertyOptions(),
  ]);

  if (!invoice) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/invoicing" className="text-sm text-slate-500 hover:text-brand-600">
        ← All invoices
      </Link>
      <InvoiceEditor initial={invoice} properties={properties} />
    </div>
  );
}
