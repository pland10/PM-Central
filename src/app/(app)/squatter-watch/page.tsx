import { prisma } from "@/lib/prisma";
import { formatAddress } from "@/lib/format";
import { SQUATTER_WATCH } from "@/lib/programs";
import { SquatterWatchTable, type SwRow } from "./SquatterWatchTable";

export const dynamic = "force-dynamic";

function ownerName(portfolio: {
  owners: { contact: { firstName: string | null; lastName: string | null; companyName: string | null } }[];
} | null): string {
  if (!portfolio || portfolio.owners.length === 0) return "—";
  const c = portfolio.owners[0].contact;
  const name = c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" ");
  const extra = portfolio.owners.length > 1 ? ` +${portfolio.owners.length - 1}` : "";
  return (name || "—") + extra;
}

export default async function SquatterWatchPage() {
  const properties = await prisma.property.findMany({
    where: { tags: { contains: SQUATTER_WATCH } },
    orderBy: { createdAt: "asc" },
    include: {
      portfolio: { include: { owners: { include: { contact: true } } } },
      _count: { select: { workOrders: true } },
    },
  });

  const rows: SwRow[] = properties.map((p) => ({
    id: p.id,
    title: p.name || p.street1,
    address: formatAddress(p),
    owner: ownerName(p.portfolio),
    type: p.propertyType,
    source: p.source,
    workOrders: p._count.workOrders,
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Squatter Watch</h1>
        <p className="mt-1 text-sm text-slate-500">
          Home-watch properties — vacant by design, so they&rsquo;re kept off the Properties
          list and out of occupancy metrics. {properties.length} propert
          {properties.length === 1 ? "y" : "ies"}.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No properties are on Squatter Watch yet. In Rentvine, add them to the{" "}
          <span className="font-medium">Squatter Watch</span> property group, then re-import —
          they&rsquo;ll appear here automatically and drop off the Properties page.
        </div>
      ) : (
        <SquatterWatchTable rows={rows} />
      )}
    </div>
  );
}
