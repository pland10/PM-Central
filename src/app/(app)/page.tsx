import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatAddress, formatCurrency } from "@/lib/format";
import { SQUATTER_WATCH } from "@/lib/programs";
import { paymentSummaryAsOf } from "@/lib/payments-dashboard";
import { workOrderStageSummary } from "@/lib/work-orders-dashboard";
import { PaymentsPane } from "./PaymentsPane";
import { ExpandableRows } from "./ExpandableRows";
import { DashboardExport } from "./DashboardExport";
import { DraggablePanels } from "./DraggablePanels";
import { DashboardEditProvider, RearrangeButton } from "./DashboardEdit";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { todaysShowings } from "@/lib/showings";
import { fetchSecurityDeposits, isRentvineConfigured } from "@/lib/security-deposits";
import type { ExportSheet } from "@/lib/export-excel";

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
  const [properties, woSummary, payments, me, todayShow, depositsLive] = await Promise.all([
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
    workOrderStageSummary(), // null until the work_orders table exists / sync runs
    paymentSummaryAsOf(), // today; null until the payments table exists / sync runs
    getCurrentUser(), // for the saved dashboard panel order (null in Basic Auth)
    todaysShowings(), // today's Tenant Turner showings; null until the table exists
    // Live security-deposit totals from Rentvine (the accurate held-in-trust
    // figure). Null if Rentvine isn't configured; falls back to the configured
    // per-lease deposits below if the report call fails.
    isRentvineConfigured() ? fetchSecurityDeposits() : Promise.resolve(null),
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

  // "Deposits held" = what PMI actually holds in trust, from the live Rentvine
  // report (PMI-held on active + moved-out/pending leases; excludes owner-held).
  // Falls back to the configured per-lease deposits if the report is
  // unavailable so the tile is never blank.
  const depositsHeld =
    depositsLive && depositsLive.ok
      ? depositsLive.summary.pmiHeldActive + depositsLive.summary.pmiHeldMovedOut
      : totalDeposits;
  // Only leases expiring within ~120 days, plus any already past — the near-term
  // renewals to act on, not every dated lease.
  const EXPIRY_HORIZON_MS = 120 * 86_400_000;
  const expirationsSorted = [...expirations]
    .filter((e) => e.endMs - now <= EXPIRY_HORIZON_MS)
    .sort((a, b) => a.endMs - b.endMs);
  const topOwners = [...ownerAgg.values()].sort((a, b) => b.rentRoll - a.rentRoll).slice(0, 6);
  const vacantSorted = [...vacancies].sort((a, b) => a.address.localeCompare(b.address));
  const topDelinquencies = [...delinquencies].sort((a, b) => b.amount - a.amount);
  const delinquentCount = delinquencies.length;
  const largestDelinquency = topDelinquencies[0]?.amount ?? 0;
  const delinquencyRate = activeLeases > 0 ? Math.round((delinquentCount / activeLeases) * 100) : 0;

  // Multi-sheet workbook for the dashboard Export button.
  const exportSheets: ExportSheet[] = [
    {
      name: "Summary",
      headers: ["Metric", "Value"],
      rows: [
        ["Properties", properties.length],
        ["Units", totalUnits],
        ["Occupancy %", occupancy],
        ["Rent roll / mo", rentRoll],
        ["Outstanding", totalBalanceDue],
        ["Deposits held", depositsHeld],
        ["Active leases", activeLeases],
        ["Open work orders", woSummary?.openTotal ?? 0],
        ["Delinquent leases", delinquentCount],
        ...(payments
          ? ([
              ["Payments pending", payments.pendingTotal],
              ["Cleared today", payments.clearedTotal],
            ] as [string, number][])
          : []),
      ],
    },
    {
      name: "Delinquencies",
      headers: ["Tenant", "Property", "Amount"],
      rows: topDelinquencies.map((d) => [d.tenant, d.address, d.amount]),
    },
    {
      name: "Expirations",
      headers: ["Tenant", "Property", "Lease end", "Rent / mo"],
      rows: expirationsSorted.map((e) => [
        e.tenant,
        e.address,
        new Date(e.endMs).toISOString().slice(0, 10),
        e.rent,
      ]),
    },
    {
      name: "Vacancies",
      headers: ["Property", "Unit"],
      rows: vacantSorted.map((v) => [v.address, v.unit]),
    },
    {
      name: "Top owners",
      headers: ["Owner", "Properties", "Rent roll / mo"],
      rows: topOwners.map((o) => [o.name, o.properties, o.rentRoll]),
    },
  ];
  if (woSummary) {
    exportSheets.push({
      name: "Work orders by stage",
      headers: ["Stage", "Count"],
      rows: woSummary.stages.map((s) => [s.stage, s.count]),
    });
  }
  if (payments) {
    const payRows: (string | number)[][] = [];
    for (const g of payments.clearedByOwner)
      for (const l of g.lines)
        payRows.push(["Now payable", l.tenant ?? "", l.property_address ?? "", l.amount, l.clear_date ?? ""]);
    for (const l of payments.pending)
      payRows.push(["In flight", l.tenant ?? "", l.property_address ?? "", l.amount, l.date_posted ?? ""]);
    for (const l of payments.returned)
      payRows.push(["Returned / NSF", l.tenant ?? "", l.property_address ?? "", l.amount, l.date_posted ?? ""]);
    exportSheets.push({
      name: "Payments",
      headers: ["Status", "Tenant", "Property", "Amount", "Date"],
      rows: payRows,
    });
  }
  if (todayShow && todayShow.rows.length) {
    exportSheets.push({
      name: "Showings today",
      headers: ["Time", "Property", "Lead", "Status"],
      rows: todayShow.rows.map((s) => [nyTime(s.time), s.address, s.leadName ?? "", s.status]),
    });
  }

  return (
    <DashboardEditProvider>
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Portfolio at a glance — {properties.length} properties across {ownerAgg.size} owners.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RearrangeButton />
          <DashboardExport sheets={exportSheets} />
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Properties" value={String(properties.length)} href="/properties" />
        <Stat label="Units" value={String(totalUnits)} href="/properties" />
        <Stat label="Occupancy" value={`${occupancy}%`} accent={occupancy < 90} />
        <Stat label="Rent roll / mo" value={formatCurrency(rentRoll)} href="/leases" />
        <Stat label="Outstanding" value={formatCurrency(totalBalanceDue)} href="/leases" accent={totalBalanceDue > 0} />
        <Stat label="Deposits held" value={formatCurrency(depositsHeld)} href="/security-deposits" />
        <Stat label="Active leases" value={String(activeLeases)} href="/leases" />
        <Stat label="Open work orders" value={String(woSummary?.openTotal ?? 0)} href="/work-orders" accent={(woSummary?.openTotal ?? 0) > 0} />
        {todayShow && (
          <Stat label="Showings today" value={String(todayShow.count)} href="/showings" accent={todayShow.count > 0} />
        )}
        {payments && (
          <>
            <Stat label="Payments pending" value={formatCurrency(payments.pendingTotal)} href="/search?types=payment" accent={payments.pendingTotal > 0} />
            <Stat label="Cleared today" value={formatCurrency(payments.clearedTotal)} href="/search?types=payment" />
          </>
        )}
      </div>

      <DraggablePanels
        initialOrder={me?.dashboardOrder ?? null}
        canPersist={!!me}
        items={[
          ...(payments ? [{ id: "payments", node: <PaymentsPane initial={payments} /> }] : []),
          ...(todayShow
            ? [{ id: "showings", node: (
        <Panel title="Today's showings" href="/showings" linkLabel="All showings" badge={todayShow.count}>
          {todayShow.rows.length === 0 ? (
            <Empty>No showings scheduled today.</Empty>
          ) : (
            <ExpandableRows initial={6}>
              {todayShow.rows.map((s) => (
                <Row key={s.id} href={s.propertyId ? `/properties/${s.propertyId}` : "/showings"}>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">{s.address}</div>
                    <div className="truncate text-xs text-slate-500">
                      {s.leadName || "—"}
                      {s.viewingType ? ` · ${s.viewingType}` : ""}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-slate-600">{nyTime(s.time)}</span>
                </Row>
              ))}
            </ExpandableRows>
          )}
        </Panel>
            ) }]
            : []),
          { id: "delinquencies", node: (
        <Panel
          title="Delinquencies"
          href="/leases"
          linkLabel="All leases"
        >
          {topDelinquencies.length === 0 ? (
            <Empty>No outstanding balances.</Empty>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                <MiniStat label="Delinquent" value={String(delinquentCount)} sub="leases" />
                <MiniStat label="Largest" value={formatCurrency(largestDelinquency)} />
                <MiniStat label="Of leases" value={`${delinquencyRate}%`} sub="delinquent" />
              </div>
              <ExpandableRows initial={5}>
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
            </>
          )}
        </Panel>
          ) },

          { id: "expirations", node: (
        <Panel title="Upcoming lease expirations" href="/leases" linkLabel="All leases" badge={expirationsSorted.length}>
          {expirationsSorted.length === 0 ? (
            <Empty>No dated leases.</Empty>
          ) : (
            <ExpandableRows initial={5}>
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
          ) },

          { id: "vacancies", node: (
        <Panel title="Vacant units" href="/properties" linkLabel="Properties" badge={vacancies.length}>
          {vacantSorted.length === 0 ? (
            <Empty>No vacancies — fully occupied.</Empty>
          ) : (
            <ExpandableRows initial={5}>
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
          ) },

          { id: "workorders", node: (
        <Panel title="Work orders by stage" href="/work-orders" linkLabel="All work orders" badge={woSummary?.openTotal ?? 0}>
          {!woSummary || woSummary.stages.length === 0 ? (
            <Empty>No work orders yet.</Empty>
          ) : (
            woSummary.stages.map((s) => (
              <Link
                key={s.stage}
                href={`/work-orders?stage=${encodeURIComponent(s.stage)}`}
                className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0 hover:text-brand-600"
              >
                <span className="min-w-0 truncate text-slate-800">{s.stage}</span>
                <span className="shrink-0 font-medium text-slate-700">{s.count}</span>
              </Link>
            ))
          )}
        </Panel>
          ) },

          { id: "topowners", node: (
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
          ) },
        ]}
      />
    </div>
    </DashboardEditProvider>
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

// Showing start time in the business's timezone (Eastern), e.g. "1:30 PM".
function nyTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50/60 p-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-800">{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

