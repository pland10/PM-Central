import { requireFeature } from "@/config/features";
import { listWorkOrders } from "@/lib/work-orders-dashboard";
import { MaintenanceView } from "./MaintenanceView";

export const dynamic = "force-dynamic";

// New work-order screen, side by side with /work-orders until it replaces it.
// Off unless FEATURE_MAINTENANCE=on.
export default async function MaintenancePage() {
  requireFeature("maintenance");
  const rows = await listWorkOrders();

  if (!rows) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">Maintenance</h1>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
          Work orders haven&apos;t synced yet.
        </div>
      </div>
    );
  }

  // Server time, passed down so the KPIs/flags don't shift between the server
  // render and hydration.
  return <MaintenanceView rows={rows} now={Date.now()} />;
}
