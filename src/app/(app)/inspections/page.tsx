import Link from "next/link";
import { requireFeature } from "@/config/features";
import { listInspectionRows } from "@/lib/inspections/db";
import { InspectionsTable } from "./InspectionsTable";

// Native Inspections over PM-Central's single database (Prisma/Postgres).
export const dynamic = "force-dynamic";

export default async function InspectionsPage() {
  requireFeature("inspections");

  const rows = await listInspectionRows();

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
