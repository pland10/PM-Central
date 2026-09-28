import { prisma } from "@/lib/prisma";
import { formatAddress, formatCurrency } from "@/lib/format";
import { LeasesTable, type LeaseRow } from "./LeasesTable";

export const dynamic = "force-dynamic";

function tenantLabel(
  tenants: { isPrimary: boolean; contact: { firstName: string | null; lastName: string | null; companyName: string | null } }[]
): string {
  if (tenants.length === 0) return "—";
  const primary = tenants.find((t) => t.isPrimary) ?? tenants[0];
  const c = primary.contact;
  const name = c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" ") || "—";
  const extra = tenants.length > 1 ? ` +${tenants.length - 1}` : "";
  return name + extra;
}

export default async function LeasesPage() {
  const leases = await prisma.lease.findMany({
    include: {
      unit: { include: { property: true } },
      tenants: { include: { contact: true } },
    },
  });

  const rows: LeaseRow[] = leases.map((l) => ({
    id: l.id,
    propertyId: l.unit.property.id,
    propertyAddress: formatAddress(l.unit.property),
    unit: l.unit.unitNumber,
    tenant: tenantLabel(l.tenants),
    rent: l.rent,
    startISO: l.startDate ? l.startDate.toISOString() : null,
    endISO: l.endDate ? l.endDate.toISOString() : null,
    status: l.status,
  }));

  const activeCount = rows.filter((r) => r.status === "active").length;
  const monthlyRent = rows
    .filter((r) => r.status === "active")
    .reduce((s, r) => s + r.rent, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Leases</h1>
        <p className="mt-1 text-sm text-slate-500">
          {activeCount} active · {formatCurrency(monthlyRent)}/mo in contracted rent.
        </p>
      </div>

      <LeasesTable rows={rows} />
    </div>
  );
}
