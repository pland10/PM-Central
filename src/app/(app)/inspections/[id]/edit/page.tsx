import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFeature } from "@/config/features";
import { getInspectionsDb } from "@/lib/inspections/supabase";
import type {
  InspectionDetail,
  ChecklistItem,
  WorkItem,
  InspectionPhoto,
} from "@/lib/inspections/types";
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

  const db = getInspectionsDb();
  if (!db) notFound();

  const insRes = await db
    .from("pmi_inspect_inspections")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (insRes.error || !insRes.data) notFound();

  const [checkRes, workRes, photoRes] = await Promise.all([
    db.from("pmi_inspect_checklist_items").select("*").eq("inspection_id", id).order("id"),
    db.from("pmi_inspect_work_items").select("*").eq("inspection_id", id).order("id"),
    db.from("pmi_inspect_photos").select("*").eq("inspection_id", id).order("id"),
  ]);

  const initial: InspectionDetail = {
    ...(insRes.data as InspectionDetail),
    checklist: (checkRes.data ?? []) as ChecklistItem[],
    work_items: (workRes.data ?? []) as WorkItem[],
    photos: (photoRes.data ?? []) as InspectionPhoto[],
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
