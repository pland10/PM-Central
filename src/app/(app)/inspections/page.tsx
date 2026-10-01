import Link from "next/link";
import { requireFeature } from "@/config/features";
import { getInspectionsDb } from "@/lib/inspections/supabase";
import type { InspectionRow, InspectionProperty, InspectionPhoto } from "@/lib/inspections/types";
import { InspectionsTable } from "./InspectionsTable";

// Native Inspections — reads the pmi_inspect_* tables from the inspections
// Supabase project server-side (secret key stays server-side). Replaces the old
// iframe embed. Read side; create/edit/photos come next.
export const dynamic = "force-dynamic";

export default async function InspectionsPage() {
  requireFeature("inspections");

  const db = getInspectionsDb();
  if (!db) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <h1 className="mb-2 text-base font-semibold">Inspections isn’t configured yet</h1>
        <p className="mb-3">
          The native Inspections view reads the inspection database directly. Set these on
          the server (they stay server-side):
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> (already set
            for login)
          </li>
          <li>
            <code className="rounded bg-amber-100 px-1">SUPABASE_SERVICE_KEY</code> — that project’s{" "}
            <em>secret</em> key
          </li>
        </ul>
      </div>
    );
  }

  const [insRes, propRes, photoRes] = await Promise.all([
    db
      .from("pmi_inspect_inspections")
      .select("*")
      .is("deleted_at", null)
      .order("inspection_date", { ascending: false })
      .limit(2000),
    db.from("pmi_inspect_properties").select("id,name,address"),
    db.from("pmi_inspect_photos").select("inspection_id"),
  ]);

  if (insRes.error) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-900">
        <h1 className="mb-2 text-base font-semibold">Couldn’t load inspections</h1>
        <pre className="whitespace-pre-wrap rounded bg-red-100 p-2 text-xs">{insRes.error.message}</pre>
      </div>
    );
  }

  const props = (propRes.data ?? []) as InspectionProperty[];
  const propMap = new Map(props.map((p) => [p.id, p]));
  const photoCounts = new Map<number, number>();
  for (const ph of (photoRes.data ?? []) as Pick<InspectionPhoto, "inspection_id">[]) {
    photoCounts.set(ph.inspection_id, (photoCounts.get(ph.inspection_id) ?? 0) + 1);
  }

  const rows: InspectionRow[] = ((insRes.data ?? []) as InspectionRow[]).map((r) => {
    const p = r.property_id != null ? propMap.get(r.property_id) : undefined;
    return {
      ...r,
      property_name: p?.name ?? "",
      property_address: p?.address ?? "",
      photo_count: photoCounts.get(r.id) ?? 0,
    };
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Inspections</h1>
          <p className="text-sm text-slate-500">{rows.length} inspection{rows.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/inspections/settings"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Settings
          </Link>
          <Link
            href="/inspections/new"
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            + New inspection
          </Link>
        </div>
      </div>
      <InspectionsTable rows={rows} />
    </div>
  );
}
