import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatAddress } from "@/lib/format";

export const dynamic = "force-dynamic";

function priorityBadge(priority: string) {
  const styles: Record<string, string> = {
    low: "bg-slate-100 text-slate-600",
    normal: "bg-blue-100 text-blue-700",
    high: "bg-amber-100 text-amber-700",
    emergency: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${
        styles[priority] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {priority}
    </span>
  );
}

export default async function WorkOrdersPage() {
  const workOrders = await prisma.workOrder.findMany({
    orderBy: { externalId: "desc" },
    include: { property: true },
  });

  const open = workOrders.filter((w) => w.status !== "completed").length;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Work Orders</h1>
        <p className="mt-1 text-sm text-slate-500">
          {open} open · maintenance across the portfolio, tied to each property.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Issue</th>
              <th className="px-4 py-3 font-medium">Property</th>
              <th className="px-4 py-3 font-medium">Priority</th>
            </tr>
          </thead>
          <tbody>
            {workOrders.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  No work orders yet.
                </td>
              </tr>
            )}
            {workOrders.map((w) => (
              <tr key={w.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-400">
                  {w.externalId?.split(":").pop() ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-800">{w.description || w.title}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/properties/${w.propertyId}`}
                    className="text-slate-600 hover:text-brand-600"
                  >
                    {formatAddress(w.property)}
                  </Link>
                </td>
                <td className="px-4 py-3">{priorityBadge(w.priority)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
