import Link from "next/link";
import { requireFeature } from "@/config/features";
import { listInspectionRows } from "@/lib/inspections/db";
import { summarizeInspections } from "@/lib/inspections/stats";
import { InspectionsTable } from "./InspectionsTable";

// Native Inspections over PM-Central's single database (Prisma/Postgres).
export const dynamic = "force-dynamic";

export default async function InspectionsPage() {
  requireFeature("inspections");

  const rows = await listInspectionRows();
  const stats = summarizeInspections(rows);

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
            href="/inspections/new?type=move_in"
            className="rounded-md border border-brand-300 px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            + Move-in
          </Link>
          <Link
            href="/inspections/new"
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            + New inspection
          </Link>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="This week" value={stats.thisWeek} />
        <StatTile label="This month" value={stats.thisMonth} />
        <StatTile label="Upcoming" value={stats.upcoming} />
        <StatTile label="Overdue" value={stats.overdue} tone={stats.overdue > 0 ? "red" : "slate"} />
        <StatTile
          label="Needs attention"
          value={stats.needsAttention}
          tone={stats.needsAttention > 0 ? "amber" : "slate"}
        />
        <StatTile label="Total" value={stats.total} />
      </div>

      <InspectionsTable rows={rows} />
    </div>
  );
}

const TILE_TONES: Record<string, string> = {
  amber: "text-amber-700",
  red: "text-red-700",
  slate: "text-slate-800",
};

function StatTile({ label, value, tone = "slate" }: { label: string; value: number; tone?: keyof typeof TILE_TONES }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${TILE_TONES[tone]}`}>{value}</div>
    </div>
  );
}
