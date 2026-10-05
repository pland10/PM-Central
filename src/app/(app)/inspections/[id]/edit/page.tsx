import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeature } from "@/config/features";
import { getInspectionDetail } from "@/lib/inspections/db";
import type { InspectionDetail } from "@/lib/inspections/types";
import { InspectionForm } from "../../InspectionForm";

export const dynamic = "force-dynamic";

export default async function EditInspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  requireFeature("inspections");
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();

  const detail = await getInspectionDetail(id);
  if (!detail) notFound();

  const initial: InspectionDetail = {
    ...detail.inspection,
    checklist: detail.checklist,
    work_items: detail.workItems,
    photos: detail.photos,
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/inspections/${id}`} className="text-sm text-slate-500 hover:text-brand-600">
        ← Back to inspection
      </Link>
      <h1 className="mb-4 mt-2 text-lg font-semibold text-ink">Edit inspection</h1>
      <InspectionForm initial={initial} />
    </div>
  );
}
