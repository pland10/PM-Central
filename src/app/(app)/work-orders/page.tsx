import { listWorkOrders } from "@/lib/work-orders-dashboard";
import { WorkOrdersTable } from "./WorkOrdersTable";

export const dynamic = "force-dynamic";

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  const rows = await listWorkOrders();

  if (!rows) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Work Orders</h1>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
          Work orders haven&apos;t synced yet.
        </div>
      </div>
    );
  }

  const active = rows.filter((r) => !r.terminal).length;
  const closed = rows.length - active;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Work Orders</h1>
        <p className="mt-1 text-sm text-slate-500">
          {active} active · {closed} closed · maintenance tracked in LeadSimple, by stage.
        </p>
      </div>

      <WorkOrdersTable rows={rows} stage={stage} />
    </div>
  );
}
