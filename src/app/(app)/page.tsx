import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatAddress, formatCurrency } from "@/lib/format";
import { SQUATTER_WATCH } from "@/lib/programs";
import { paymentSummaryAsOf } from "@/lib/payments-dashboard";
import { PaymentsPane } from "./PaymentsPane";
import { ExpandableRows } from "./ExpandableRows";

export const dynamic = "force-dynamic";

function contactName(c: {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
} | undefined): string {
  if (!c) return "Occupied";
  return c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" ") || "Occupied";
}

export default async function DashboardPage() {
  const [properties, highWorkOrders, payments] = await Promise.all([
    prisma.property.findMany({
      // Exclude Squatter Watch (home-watch, vacant by design) and inactive
      // properties (e.g. terminated agreements) so they don't distort occupancy.
      where: { status: "active", NOT: { tags: { contains: SQUATTER_WATCH } } },
      include: {
        portfolio: true,
        units: {
          include: { leases: { include: { tenants: { include: { contact: true } } } } },
        },
      },
    }),
    prisma.workOrder.findMany({
      where: { priority: "high", status: { not: "completed" } },
      include: { property: true },
      orderBy: { externalId: "desc" },
    }),
    paymentSummaryAsOf(), // today; null until the payments table exists / sync runs
  ]);

  const now = Date.now();
  let totalUnits = 0;
  let occupiedUnits = 0;
  let rentRoll = 0;
  let totalBalanceDue = 0;
  let totalDeposits = 0;
  const vacancies: { key: string; propertyId: string; address: string; unit: string }[] = [];
  const expirations: {
    key: string; propertyId: string; address: string; tenant: string; endMs: number; rent: number;
  }[] = [];
  const delinquencies: {
    key: string; propertyId: string; address: string; tenant: string; amount: number;
  }[] = [];
  const ownerAgg = new Map<string, { name: string; properties: number; rentRoll: number }>();

  for (const p of properties) {
    const ownerName = p.portfolio?.name ?? "Unassigned";
    const agg = ownerAgg.get(ownerName) ?? { name: ownerName, properties: 0, rentRoll: 0 };
    agg.properties += 1;

    for (const u of p.units) {
      totalUnits += 1;
      const active = u.leases.find((l) => l.status === "active");
      if (active) {
        occupiedUnits += 1;
        rentRoll += active.rent;
        totalBalanceDue += active.balanceDue;
        totalDeposits += active.depositBalance;
        agg.rentRoll += active.rent;
        const tenant = contactName(active.tenants[0]?.contact);
        if (active.endDate) {
          expirations.push({
            key: active.id, propertyId: p.id, address: formatAddress(p), tenant,
            endMs: active.endDate.getTime(), rent: active.rent,
          });
        }
        if (active.balanceDue > 0) {
          delinquencies.push({
            key: active.id, propertyId: p.id, address: formatAddress(p), tenant, amount: active.balanceDue,
          });
        }
      } else {
        vacancies.push({ key: u.id, propertyId: p.id, address: formatAddress(p), unit: u.unitNumber });
      }
    }
    ownerAgg.set(ownerName, agg);
  }

  const occupancy = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
  const activeLeases = expirations.length;
  const expirationsSorted = [...expirations].sort((a, b) => a.endMs - b.endMs);
  const topOwners = [...ownerAgg.values()].sort((a, b) => b.rentRoll - a.rentRoll).slice(0, 6);
  const vacantSorted = [...vacancies].sort((a, b) => a.address.localeCompare(b.address));
  const topDelinquencies = [...delinquencies].sort((a, b) => b.amount - a.amount);
  const delinquenciesTotal = delinquencies.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Portfolio at a glance — {properties.length} properties across {ownerAgg.size} owners.
        </p>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Properties" value={String(properties.length)} href="/properties" />
        <Stat label="Units" value={String(totalUnits)} href="/properties" />
        <Stat label="Occupancy" value={`${occupancy}%`} accent={occupancy < 90} />
        <Stat label="Rent roll / mo" value={formatCurrency(rentRoll)} href="/leases" />
        <Stat label="Outstanding" value={formatCurrency(totalBalanceDue)} href="/leases" accent={totalBalanceDue > 0} />
        <Stat label="Deposits held" value={formatCurrency(totalDeposits)} href="/leases" />
        <Stat label="Active leases" value={String(activeLeases)} href="/leases" />
        <Stat label="High-priority WOs" value={String(highWorkOrders.length)} href="/work-orders" accent={highWorkOrders.length > 0} />
        {payments && (
          <>
            <Stat label="Payments pending" value={formatCurrency(payments.pendingTotal)} href="/search?types=payment" accent={payments.pendingTotal > 0} />
            <Stat label="Cleared today" value={formatCurrency(payments.clearedTotal)} href="/search?types=payment" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {payments && <PaymentsPane initial={payments} />}

        <Panel
          title="Delinquencies"
          href="/leases"
          linkLabel="All leases"
          badge={topDelinquencies.length}
          amount={delinquenciesTotal}
        >
          {topDelinquencies.length === 0 ? (
            <Empty>No outstanding balances.</Empty>
          ) : (
            <ExpandableRows initial={8}>
              {topDelinquencies.map((d) => (
                <Row key={d.key} href={`/properties/${d.propertyId}`}>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">{d.tenant}</div>
                    <div className="truncate text-xs text-slate-500">{d.address}</div>
                  </div>
                  <span className="shrink-0 font-medium text-red-600">{formatCurrency(d.amount)}</span>
                </Row>
              ))}
            </ExpandableRows>
          )}
        </Panel>

        <Panel title="Upcoming lease expirations" href="/leases" linkLabel="All leases" badge={expirationsSorted.length}>
          {expirationsSorted.length === 0 ? (
            <Empty>No dated leases.</Empty>
          ) : (
            <ExpandableRows initial={8}>
              {expirationsSorted.map((e) => {
                const days = Math.round((e.endMs - now) / 86_400_000);
                const label = days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? "today" : `in ${days}d`;
                const tone = days < 0 ? "text-red-600" : days <= 60 ? "text-amber-600" : "text-slate-500";
                return (
                  <Row key={e.key} href={`/properties/${e.propertyId}`}>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-800">{e.tenant}</div>
                      <div className="truncate text-xs text-slate-500">{e.address}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`text-xs font-medium ${tone}`}>{label}</div>
                      <div className="text-xs text-slate-400">{formatCurrency(e.rent)}/mo</div>
                    </div>
                  </Row>
                );
              })}
            </ExpandableRows>
          )}
        </Panel>

        <Panel title="Vacant units" href="/properties" linkLabel="Properties" badge={vacancies.length}>
          {vacantSorted.length === 0 ? (
            <Empty>No vacancies — fully occupied.</Empty>
          ) : (
            <ExpandableRows initial={8}>
              {vacantSorted.map((v) => (
                <Row key={v.key} href={`/properties/${v.propertyId}`}>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">{v.address}</div>
                    <div className="text-xs text-slate-500">Unit {v.unit}</div>
                  </div>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                    vacant
                  </span>
                </Row>
              ))}
            </ExpandableRows>
          )}
        </Panel>

        <Panel title="High-priority work orders" href="/work-orders" linkLabel="All work orders" badge={highWorkOrders.length}>
          {highWorkOrders.length === 0 ? (
            <Empty>Nothing high-priority open.</Empty>
          ) : (
            <ExpandableRows initial={8}>
              {highWorkOrders.map((w) => (
                <Row key={w.id} href={`/properties/${w.propertyId}`}>
                  <div className="min-w-0">
                    <div className="truncate text-slate-800">{w.description || w.title}</div>
                    <div className="truncate text-xs text-slate-500">{formatAddress(w.property)}</div>
                  </div>
                  <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium capitalize text-amber-700">
                    high
                  </span>
                </Row>
              ))}
            </ExpandableRows>
          )}
        </Panel>

        <Panel title="Top owners by rent roll" href="/portfolios" linkLabel="All portfolios">
          {topOwners.map((o, i) => (
            <div key={o.name} className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0 text-sm">
              <div className="min-w-0">
                <span className="mr-2 text-xs text-slate-400">{i + 1}.</span>
                <span className="font-medium text-slate-800">{o.name}</span>
                <span className="ml-2 text-xs text-slate-400">
                  {o.properties} propert{o.properties === 1 ? "y" : "ies"}
                </span>
              </div>
              <span className="shrink-0 text-slate-700">{formatCurrency(o.rentRoll)}/mo</span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value, href, accent }: { label: string; value: string; href?: string; accent?: boolean }) {
  const body = (
    <div className="rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${accent ? "text-brand-600" : ""}`}>{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Panel({ title, href, linkLabel, badge, amount, children }: {
  title: string; href?: string; linkLabel?: string; badge?: number; amount?: number; children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center text-sm font-semibold uppercase tracking-wide text-slate-500">
          {title}
          {badge != null && (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">{badge}</span>
          )}
          {amount != null && (
            <span className="ml-1.5 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-600">
              {formatCurrency(amount)}
            </span>
          )}
        </h2>
        {href && linkLabel && (
          <Link href={href} className="text-xs font-medium text-brand-600 hover:underline">{linkLabel} →</Link>
        )}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Row({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0 hover:bg-slate-50">
      {children}
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-6 text-center text-sm text-slate-400">{children}</div>;
}

