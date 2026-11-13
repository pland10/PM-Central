import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { loadManagementKpis } from "@/lib/management-dashboard";
import { ManagementDashboard } from "./ManagementDashboard";

// Management Dashboard: KPI charts for review/accountability (work orders +
// accounting ops to start). Separate from the main dashboard; admins only.
export const dynamic = "force-dynamic";
export const maxDuration = 60; // headroom for the live work-order + plaid queries

export default async function ManagementDashboardPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") notFound();

  const data = await loadManagementKpis(12);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Management Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            KPIs for review — collections, work orders and accounting ops. Leasing &amp; inspections coming next.
          </p>
        </div>
        <span className="text-xs text-slate-400">
          As of {new Date(data.generatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
        </span>
      </div>
      <ManagementDashboard data={data} />
    </div>
  );
}
