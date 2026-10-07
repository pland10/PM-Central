import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { getSyncStatusMap } from "@/lib/sync-status";
import { DATA_SOURCES } from "@/config/data-sources";
import { RefreshButton } from "./RefreshButton";

export const dynamic = "force-dynamic";

function timeAgo(d: Date | null): string {
  if (!d) return "Never";
  const ms = Date.now() - new Date(d).getTime();
  if (ms < 0) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default async function AdminDataPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") notFound();

  const status = await getSyncStatusMap();

  const rows = DATA_SOURCES.map((s) => {
    const present = s.jobs.map((j) => status[j]).filter(Boolean);
    // Freshness = the OLDEST of the backing jobs ("at least this fresh").
    const oldest = present.reduce<Date | null>((acc, r) => {
      const t = r.last_run_at ? new Date(r.last_run_at) : null;
      if (!t) return acc;
      return !acc || t < acc ? t : acc;
    }, null);
    const stuck = present.some((r) => /stuck/i.test(r.detail || ""));
    const detail = present.find((r) => /stuck/i.test(r.detail || ""))?.detail
      ?? present[0]?.detail
      ?? null;
    return { s, lastRun: oldest, stuck, detail, everRan: present.length > 0 };
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Data sources</h1>
        <p className="mt-1 text-sm text-slate-500">
          Where each piece of data comes from, when it last refreshed, and a button to pull it now.
          Scheduled refreshes run automatically; use Refresh to pull off-cycle.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Data</th>
              <th className="px-4 py-2.5 font-semibold">Schedule</th>
              <th className="px-4 py-2.5 font-semibold">Last refreshed</th>
              <th className="px-4 py-2.5 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ s, lastRun, stuck, detail, everRan }) => (
              <tr key={s.id} className={s.comingSoon ? "opacity-60" : ""}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{s.label}</div>
                  <div className="text-xs text-slate-500">{s.description}</div>
                  {stuck && detail && (
                    <div className="mt-1 text-xs font-medium text-amber-600">⚠ {detail}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{s.cadence}</td>
                <td className="px-4 py-3">
                  <span className={everRan ? "text-slate-700" : "text-slate-400"}>
                    {s.comingSoon ? "—" : timeAgo(lastRun)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <RefreshButton source={s.id} disabled={s.comingSoon} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        After clicking Refresh, the sync runs in the background (usually 1–2 minutes). Reload this
        page to see the updated time.
      </p>
    </div>
  );
}
