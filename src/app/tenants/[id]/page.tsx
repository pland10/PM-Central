import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatAddress, formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

function fmtMonth(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default async function TenantDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      leaseLinks: {
        include: {
          lease: {
            include: {
              unit: { include: { property: { include: { portfolio: true } } } },
            },
          },
        },
      },
    },
  });

  if (!contact) notFound();

  const name =
    contact.companyName ||
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    "Tenant";

  const leases = contact.leaseLinks
    .map((lt) => lt.lease)
    .sort((a, b) => (a.status === "active" ? -1 : 1) - (b.status === "active" ? -1 : 1));

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/tenants" className="text-sm text-brand-600 hover:underline">
        ← Tenants
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{name}</h1>
      <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-slate-500">
        {contact.email && (
          <a href={`mailto:${contact.email}`} className="text-brand-600 hover:underline">
            {contact.email}
          </a>
        )}
        {contact.phone && <span>{contact.phone}</span>}
        {!contact.email && !contact.phone && <span>No contact info on file.</span>}
      </p>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Leases
        </h2>
        <ul className="divide-y divide-slate-100">
          {leases.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-4 py-3 text-sm">
              <div className="min-w-0">
                <Link
                  href={`/properties/${l.unit.property.id}`}
                  className="font-medium text-slate-800 hover:text-brand-600"
                >
                  {formatAddress(l.unit.property)}
                </Link>
                <div className="text-xs text-slate-500">
                  Unit {l.unit.unitNumber}
                  {l.unit.property.portfolio && (
                    <>
                      {" · "}
                      <Link
                        href={`/portfolios/${l.unit.property.portfolio.id}`}
                        className="text-brand-600 hover:underline"
                      >
                        {l.unit.property.portfolio.name}
                      </Link>
                    </>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {fmtMonth(l.startDate)} – {fmtMonth(l.endDate)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-slate-700">{formatCurrency(l.rent)}/mo</div>
                {l.balanceDue > 0 && (
                  <div className="text-xs font-medium text-red-600">
                    {formatCurrency(l.balanceDue)} due
                  </div>
                )}
                <span
                  className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${
                    l.status === "active"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {l.status}
                </span>
              </div>
            </li>
          ))}
          {leases.length === 0 && <li className="py-2 text-sm text-slate-400">No leases on file.</li>}
        </ul>
      </section>
    </div>
  );
}
