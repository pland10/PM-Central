import { prisma } from "@/lib/prisma";
import { formatAddress } from "@/lib/format";
import { WorkOrdersTable, type WorkOrderRow } from "./WorkOrdersTable";

export const dynamic = "force-dynamic";

export default async function WorkOrdersPage() {
  const workOrders = await prisma.workOrder.findMany({
    orderBy: { externalId: "desc" },
    include: { property: true },
  });

  const rows: WorkOrderRow[] = workOrders.map((w) => ({
    id: w.id,
    number: w.externalId?.split(":").pop() ?? "—",
    issue: w.description || w.title,
    propertyId: w.propertyId,
    propertyAddress: formatAddress(w.property),
    priority: w.priority,
    state: w.status === "completed" ? "closed" : "open",
  }));

  const open = workOrders.filter((w) => w.status !== "completed").length;
  const closed = workOrders.length - open;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Work Orders</h1>
        <p className="mt-1 text-sm text-slate-500">
          {open} open · {closed} closed · maintenance across the portfolio, tied to each property.
        </p>
      </div>

      <WorkOrdersTable rows={rows} />
    </div>
  );
}
