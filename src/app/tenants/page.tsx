import { prisma } from "@/lib/prisma";
import { formatAddress } from "@/lib/format";
import { TenantsTable, type TenantRow } from "./TenantsTable";

export const dynamic = "force-dynamic";

function fullName(c: {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}) {
  return c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" ") || "—";
}

export default async function TenantsPage() {
  const links = await prisma.leaseTenant.findMany({
    include: {
      contact: true,
      lease: { include: { unit: { include: { property: true } } } },
    },
  });

  const rows: TenantRow[] = links
    .filter((lt) => lt.lease.status === "active")
    .map((lt) => ({
      id: lt.id,
      contactId: lt.contactId,
      name: fullName(lt.contact),
      email: lt.contact.email,
      phone: lt.contact.phone,
      propertyId: lt.lease.unit.property.id,
      propertyAddress: formatAddress(lt.lease.unit.property),
      startISO: lt.lease.startDate ? lt.lease.startDate.toISOString() : null,
      endISO: lt.lease.endDate ? lt.lease.endDate.toISOString() : null,
      status: lt.lease.status,
    }));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
        <p className="mt-1 text-sm text-slate-500">
          {rows.length} active tenant{rows.length === 1 ? "" : "s"} · contact info and the
          property each one rents, in one place.
        </p>
      </div>

      <TenantsTable rows={rows} />
    </div>
  );
}
