import { prisma } from "@/lib/prisma";
import { formatAddress, formatCurrency } from "@/lib/format";
import { BRAND } from "@/config/brand";
import { PropertiesTable, type PropertyRow } from "./PropertiesTable";

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

export default async function PropertiesPage() {
  const properties = await prisma.property.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      portfolio: { include: { owners: { include: { contact: true } } } },
      units: { include: { leases: true } },
    },
  });

  const rows: PropertyRow[] = properties.map((p) => {
    const unitCount = p.units.length;
    const occupied = p.units.filter((u) => u.leases.some((l) => l.status === "active")).length;
    const rentRoll = p.units.reduce((sum, u) => {
      const active = u.leases.find((l) => l.status === "active");
      return sum + (active?.rent ?? 0);
    }, 0);
    const occupancy = unitCount > 0 ? Math.round((occupied / unitCount) * 100) : 0;
    return {
      id: p.id,
      title: p.name || p.street1,
      address: formatAddress(p),
      owner: ownerName(p.portfolio),
      unitCount,
      occupied,
      occupancy,
      rentRoll,
      type: p.propertyType,
      source: p.source,
    };
  });

  const totalUnits = rows.reduce((s, r) => s + r.unitCount, 0);
  const totalRentRoll = rows.reduce((s, r) => s + r.rentRoll, 0);
  const totalOccupied = rows.reduce((s, r) => s + r.occupied, 0);
  const portfolioOccupancy = totalUnits > 0 ? Math.round((totalOccupied / totalUnits) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Properties</h1>
          <p className="mt-1 text-sm text-slate-500">
            The foundation of the hub. {properties.length} propert
            {properties.length === 1 ? "y" : "ies"} · pulled from multiple sources.
          </p>
        </div>
        <button
          disabled
          title="Coming soon"
          className="cursor-not-allowed rounded-md px-3 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: BRAND.colors.primary }}
        >
          + Add property
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Properties" value={String(properties.length)} />
        <Stat label="Units" value={String(totalUnits)} />
        <Stat label="Occupancy" value={`${portfolioOccupancy}%`} />
        <Stat label="Rent roll / mo" value={formatCurrency(totalRentRoll)} />
      </div>

      <PropertiesTable rows={rows} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
