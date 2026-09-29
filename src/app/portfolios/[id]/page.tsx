import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatAddress, formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

function contactName(c: {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}) {
  return c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" ") || "—";
}

export default async function PortfolioDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pf = await prisma.portfolio.findUnique({
    where: { id },
    include: {
      owners: { include: { contact: true } },
      properties: {
        orderBy: { createdAt: "asc" },
        include: { units: { include: { leases: true } } },
      },
    },
  });

  if (!pf) notFound();

  let unitCount = 0;
  let occupied = 0;
  let rentRoll = 0;
  const propRows = pf.properties.map((p) => {
    let u = 0;
    let o = 0;
    let rr = 0;
    for (const unit of p.units) {
      u += 1;
      unitCount += 1;
      const active = unit.leases.find((l) => l.status === "active");
      if (active) {
        o += 1;
        occupied += 1;
        rr += active.rent;
        rentRoll += active.rent;
      }
    }
    return { id: p.id, address: formatAddress(p), type: p.propertyType, units: u, occupied: o, rentRoll: rr };
  });
  const occupancy = unitCount > 0 ? Math.round((occupied / unitCount) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/portfolios" className="text-sm text-brand-600 hover:underline">
        ← Portfolios
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{pf.name}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {pf.owners.map((o) => contactName(o.contact)).join(", ") || "No owner on file"}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Properties" value={String(pf.properties.length)} />
        <Stat label="Units" value={String(unitCount)} />
        <Stat label="Occupancy" value={`${occupancy}%`} />
        <Stat label="Rent roll / mo" value={formatCurrency(rentRoll)} />
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Owners
        </h2>
        <ul className="divide-y divide-slate-100">
          {pf.owners.map((o) => (
            <li key={o.id} className="flex items-center justify-between py-2 text-sm">
              <span className="font-medium text-slate-800">{contactName(o.contact)}</span>
              <span className="text-slate-500">
                {o.contact.email || o.contact.phone || "—"}
              </span>
            </li>
          ))}
          {pf.owners.length === 0 && <li className="py-2 text-sm text-slate-400">No owners on file.</li>}
        </ul>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Properties ({pf.properties.length})
        </h2>
        <ul className="divide-y divide-slate-100">
          {propRows.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 py-2 text-sm">
              <Link href={`/properties/${p.id}`} className="min-w-0 font-medium text-slate-800 hover:text-brand-600">
                <span className="block truncate">{p.address}</span>
                <span className="text-xs font-normal capitalize text-slate-400">
                  {p.type.replace("-", " ")}
                </span>
              </Link>
              <div className="shrink-0 text-right">
                <div className="text-slate-600">{formatCurrency(p.rentRoll)}/mo</div>
                <div className="text-xs text-slate-400">
                  {p.occupied}/{p.units} occupied
                </div>
              </div>
            </li>
          ))}
          {propRows.length === 0 && <li className="py-2 text-sm text-slate-400">No properties.</li>}
        </ul>
      </section>
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
