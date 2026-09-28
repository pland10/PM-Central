import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatAddress } from "@/lib/format";

export const dynamic = "force-dynamic";

function fullName(c: {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}) {
  return c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" ") || "—";
}

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default async function TenantsPage() {
  const links = await prisma.leaseTenant.findMany({
    include: {
      contact: true,
      lease: { include: { unit: { include: { property: true } } } },
    },
  });

  const rows = links
    .map((lt) => ({
      lt,
      name: fullName(lt.contact),
      property: lt.lease.unit.property,
      lease: lt.lease,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const active = rows.filter((r) => r.lease.status === "active");

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
        <p className="mt-1 text-sm text-slate-500">
          {active.length} active tenant{active.length === 1 ? "" : "s"} · contact info
          and the property each one rents, in one place.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Tenant</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Property</th>
              <th className="px-4 py-3 font-medium">Lease term</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {active.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  No tenants yet.
                </td>
              </tr>
            )}
            {active.map(({ lt, name, property, lease }) => (
              <tr key={lt.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{name}</td>
                <td className="px-4 py-3">
                  {lt.contact.email && (
                    <a
                      href={`mailto:${lt.contact.email}`}
                      className="block text-brand-600 hover:underline"
                    >
                      {lt.contact.email}
                    </a>
                  )}
                  {lt.contact.phone && (
                    <span className="text-slate-500">{lt.contact.phone}</span>
                  )}
                  {!lt.contact.email && !lt.contact.phone && (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/properties/${property.id}`}
                    className="text-slate-700 hover:text-brand-600"
                  >
                    {formatAddress(property)}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {fmtDate(lease.startDate)} – {fmtDate(lease.endDate)}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium capitalize text-emerald-700">
                    {lease.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
