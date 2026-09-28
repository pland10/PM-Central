import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatAddress, formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PropertyDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      portfolio: { include: { owners: { include: { contact: true } } } },
      units: { include: { leases: { include: { tenants: { include: { contact: true } } } } } },
      workOrders: true,
    },
  });

  if (!property) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/properties" className="text-sm text-brand-600 hover:underline">
        ← Properties
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {property.name || property.street1}
      </h1>
      <p className="mt-1 text-sm text-slate-500">{formatAddress(property)}</p>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Units
          </h2>
          <ul className="divide-y divide-slate-100">
            {property.units.map((u) => {
              const active = u.leases.find((l) => l.status === "active");
              const tenant = active?.tenants[0]?.contact;
              return (
                <li key={u.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-medium">Unit {u.unitNumber}</span>
                    <span className="ml-2 text-slate-400">
                      {u.beds ?? "?"}bd / {u.baths ?? "?"}ba
                    </span>
                  </div>
                  <div className="text-right">
                    {active ? (
                      <>
                        <div className="text-slate-700">
                          {tenant
                            ? [tenant.firstName, tenant.lastName].filter(Boolean).join(" ")
                            : "Occupied"}
                        </div>
                        <div className="text-xs text-emerald-600">
                          {formatCurrency(active.rent)}/mo
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">Vacant</span>
                    )}
                  </div>
                </li>
              );
            })}
            {property.units.length === 0 && (
              <li className="py-2 text-sm text-slate-400">No units.</li>
            )}
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Details
          </h2>
          <dl className="space-y-2 text-sm">
            <Row label="Type" value={property.propertyType.replace("-", " ")} />
            <Row label="Status" value={property.status} />
            <Row label="Portfolio" value={property.portfolio?.name ?? "—"} />
            <Row
              label="Owner"
              value={
                property.portfolio?.owners[0]?.contact
                  ? property.portfolio.owners[0].contact.companyName ||
                    [
                      property.portfolio.owners[0].contact.firstName,
                      property.portfolio.owners[0].contact.lastName,
                    ]
                      .filter(Boolean)
                      .join(" ")
                  : "—"
              }
            />
            <Row label="Source" value={property.source} />
            <Row label="Open work orders" value={String(
              property.workOrders.filter((w) => w.status !== "completed").length
            )} />
          </dl>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium capitalize text-slate-800">{value}</dd>
    </div>
  );
}
