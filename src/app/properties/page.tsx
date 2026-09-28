import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatAddress, formatCurrency } from "@/lib/format";

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

function sourceBadge(source: string) {
  const styles: Record<string, string> = {
    manual: "bg-slate-100 text-slate-600",
    rentvine: "bg-emerald-100 text-emerald-700",
  };
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${
        styles[source] ?? "bg-indigo-100 text-indigo-700"
      }`}
    >
      {source}
    </span>
  );
}

export default async function PropertiesPage() {
  const properties = await prisma.property.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      portfolio: { include: { owners: { include: { contact: true } } } },
      units: { include: { leases: true } },
    },
  });

  const rows = properties.map((p) => {
    const unitCount = p.units.length;
    const occupied = p.units.filter((u) =>
      u.leases.some((l) => l.status === "active")
    ).length;
    const rentRoll = p.units.reduce((sum, u) => {
      const active = u.leases.find((l) => l.status === "active");
      return sum + (active?.rent ?? 0);
    }, 0);
    const occupancy = unitCount > 0 ? Math.round((occupied / unitCount) * 100) : 0;
    return { p, unitCount, occupied, rentRoll, occupancy };
  });

  const totalUnits = rows.reduce((s, r) => s + r.unitCount, 0);
  const totalRentRoll = rows.reduce((s, r) => s + r.rentRoll, 0);
  const totalOccupied = rows.reduce((s, r) => s + r.occupied, 0);
  const portfolioOccupancy =
    totalUnits > 0 ? Math.round((totalOccupied / totalUnits) * 100) : 0;

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
          className="cursor-not-allowed rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white opacity-60"
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

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Property</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 text-right font-medium">Units</th>
              <th className="px-4 py-3 text-right font-medium">Occupancy</th>
              <th className="px-4 py-3 text-right font-medium">Rent roll</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No properties yet. Seed the database or wire up an import to get
                  started.
                </td>
              </tr>
            )}
            {rows.map(({ p, unitCount, occupied, rentRoll, occupancy }) => (
              <tr
                key={p.id}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/properties/${p.id}`}
                    className="font-medium text-slate-900 hover:text-brand-600"
                  >
                    {p.name || p.street1}
                  </Link>
                  <div className="text-xs text-slate-500">{formatAddress(p)}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {ownerName(p.portfolio)}
                </td>
                <td className="px-4 py-3 text-right text-slate-600">{unitCount}</td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={
                      occupancy === 100
                        ? "text-emerald-600"
                        : occupancy === 0
                        ? "text-slate-400"
                        : "text-amber-600"
                    }
                  >
                    {occupancy}%
                  </span>
                  <span className="text-xs text-slate-400"> ({occupied}/{unitCount})</span>
                </td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {formatCurrency(rentRoll)}
                </td>
                <td className="px-4 py-3 capitalize text-slate-600">
                  {p.propertyType.replace("-", " ")}
                </td>
                <td className="px-4 py-3">{sourceBadge(p.source)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
