import { requireFeature } from "@/config/features";
import { listWorkOrders } from "@/lib/work-orders-dashboard";
import { noteSummaries } from "@/lib/work-order-notes-db";
import { techAssignments } from "@/lib/work-order-tech-db";
import { listStaff } from "@/lib/staff";
import { prisma } from "@/lib/prisma";
import { buildPropertyChoices, listPropertyOptions } from "@/lib/property-options";
import { listActiveUnits } from "@/lib/rentvine-units";
import { MaintenanceView } from "./MaintenanceView";
import { NewWorkOrder } from "./NewWorkOrder";

export const dynamic = "force-dynamic";

// New work-order screen, side by side with /work-orders until it replaces it.
// Off unless FEATURE_MAINTENANCE=on.
export default async function MaintenancePage() {
  requireFeature("maintenance");
  const [rows, notes, techs, staff, properties, units] = await Promise.all([
    listWorkOrders(),
    noteSummaries(),
    techAssignments(),
    listStaff().catch(() => []),
    listPropertyOptions().catch(() => []),
    listActiveUnits(prisma),
  ]);
  const newWorkOrder = <NewWorkOrder choices={buildPropertyChoices(properties, units)} />;

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
  return <MaintenanceView rows={rows} now={Date.now()} notes={notes} staff={staff} techs={techs} actions={newWorkOrder} />;
}
