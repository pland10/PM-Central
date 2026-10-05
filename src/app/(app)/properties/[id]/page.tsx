import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatAddress, formatCurrency } from "@/lib/format";
import { externalLink } from "@/lib/externalLinks";
import { isFeatureEnabled } from "@/config/features";
import { inspectionsForRvId } from "@/lib/inspections/db";
import { type InspectionRow, statusTone, formatInspectionDate } from "@/lib/inspections/types";
import { loadInvoicesForProperty } from "@/lib/invoicing-query";
import { type InvoiceRow, invoiceTotals, formatMoney, formatDate } from "@/lib/invoices";

export const dynamic = "force-dynamic";

const INSPECTION_TONE: Record<string, string> = {
  good: "bg-emerald-100 text-emerald-700",
  warn: "bg-amber-100 text-amber-700",
  bad: "bg-red-100 text-red-700",
  neutral: "bg-slate-100 text-slate-600",
};

const INVOICE_TONE: Record<InvoiceRow["status"], string> = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
};

// Invoices linked to this property (by externalId) in the single PM-Central DB.
async function invoicesForProperty(externalId: string | null): Promise<InvoiceRow[]> {
  if (!isFeatureEnabled("invoicing")) return [];
  try {
    return await loadInvoicesForProperty(externalId);
  } catch {
    return [];
  }
}

// Inspections are keyed by Rentvine property id (rv_id) in the inspection
// tables, so match this property's Rentvine id to find them.
async function inspectionsForProperty(externalId: string | null): Promise<InspectionRow[]> {
  if (!isFeatureEnabled("inspections")) return [];
  const rvId = externalId?.split(":").pop() ?? "";
  if (!rvId) return [];
  try {
    return await inspectionsForRvId(rvId);
  } catch {
    return [];
  }
}

function fmtMonth(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function contactName(c: {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}) {
  return c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" ") || "Tenant";
}

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

  const rvLink = externalLink(property.source, property.externalId);
  const owner = property.portfolio?.owners[0]?.contact;
  const openWorkOrders = property.workOrders.filter((w) => w.status !== "completed").length;
  const workOrders = [...property.workOrders].sort(
    (a, b) => (a.status !== "completed" ? 0 : 1) - (b.status !== "completed" ? 0 : 1)
  );
  const [inspections, invoices] = await Promise.all([
    inspectionsForProperty(property.externalId),
    invoicesForProperty(property.externalId),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/properties" className="text-sm text-brand-600 hover:underline">
        ← Properties
      </Link>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {property.name || property.street1}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{formatAddress(property)}</p>
        </div>
        {rvLink && (
          <a
            href={rvLink.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-brand-500 hover:text-brand-600"
          >
            Open in {rvLink.label} ↗
          </a>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-4 md:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Units &amp; Leases
          </h2>
          <ul className="divide-y divide-slate-100">
            {property.units.map((u) => {
              const active = u.leases.find((l) => l.status === "active");
              return (
                <li key={u.id} className="py-3">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">Unit {u.unitNumber}</span>
                      <span className="ml-2 text-slate-400">
                        {u.beds ?? "?"}bd / {u.baths ?? "?"}ba
                      </span>
                    </div>
                    {active ? (
                      <div className="text-right">
                        <div className="text-emerald-600">{formatCurrency(active.rent)}/mo</div>
                        <div className="text-xs text-slate-400">
                          {fmtMonth(active.startDate)} – {fmtMonth(active.endDate)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Vacant</span>
                    )}
                  </div>
                  {active && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      {active.tenants.map((t) => (
                        <Link
                          key={t.id}
                          href={`/tenants/${t.contact.id}`}
                          className="font-medium text-brand-600 hover:underline"
                        >
                          {contactName(t.contact)}
                        </Link>
                      ))}
                      {active.tenants.length === 0 && <span className="text-slate-400">Occupied</span>}
                      {active.balanceDue > 0 && (
                        <span className="font-medium text-red-600">
                          {formatCurrency(active.balanceDue)} due
                        </span>
                      )}
                    </div>
                  )}
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
            <div className="flex justify-between">
              <dt className="text-slate-500">Portfolio</dt>
              <dd className="font-medium text-slate-800">
                {property.portfolio ? (
                  <Link href={`/portfolios/${property.portfolio.id}`} className="text-brand-600 hover:underline">
                    {property.portfolio.name}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Owner</dt>
              <dd className="font-medium text-slate-800">
                {owner ? (
                  property.portfolio ? (
                    <Link href={`/portfolios/${property.portfolio.id}`} className="text-brand-600 hover:underline">
                      {contactName(owner)}
                    </Link>
                  ) : (
                    contactName(owner)
                  )
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <Row label="Source" value={property.source} />
            <Row label="Open work orders" value={String(openWorkOrders)} />
          </dl>
        </section>
      </div>

      {property.workOrders.length > 0 && (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Work Orders ({openWorkOrders} open / {property.workOrders.length} total)
          </h2>
          <ul className="divide-y divide-slate-100">
            {workOrders.map((w) => {
              const wl = externalLink(w.source, w.externalId);
              const isOpen = w.status !== "completed";
              return (
                <li key={w.id} className="flex items-start justify-between gap-4 py-2 text-sm">
                  <span className="text-slate-700">{w.description || w.title}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        isOpen ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {isOpen ? "Open" : "Closed"}
                    </span>
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium capitalize text-blue-700">
                      {w.priority}
                    </span>
                    {wl && (
                      <a
                        href={wl.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-brand-600 hover:underline"
                        title={`Open in ${wl.label}`}
                      >
                        ↗
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {isFeatureEnabled("inspections") && (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Inspections
            </h2>
            <Link href="/inspections" className="text-xs text-brand-600 hover:underline">
              All inspections →
            </Link>
          </div>
          {inspections.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">No inspections recorded for this property.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {inspections.map((ins) => (
                <li key={ins.id} className="py-2">
                  <Link
                    href={`/inspections/${ins.id}`}
                    className="flex items-start justify-between gap-4 text-sm hover:text-brand-600"
                  >
                    <div>
                      <span className="font-medium text-slate-700">
                        {formatInspectionDate(ins.inspection_date)}
                      </span>
                      {ins.inspection_reason && (
                        <span className="ml-2 text-slate-500">{ins.inspection_reason}</span>
                      )}
                      {ins.inspector_name && (
                        <div className="text-xs text-slate-400">{ins.inspector_name}</div>
                      )}
                    </div>
                    {ins.overall_status && (
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          INSPECTION_TONE[statusTone(ins.overall_status)]
                        }`}
                      >
                        {ins.overall_status}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isFeatureEnabled("invoicing") && (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Invoices
            </h2>
            <Link href="/invoicing" className="text-xs text-brand-600 hover:underline">
              All invoices →
            </Link>
          </div>
          {invoices.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">
              No invoices linked to this property. Link one in the invoice editor.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {invoices.map((inv) => (
                <li key={inv.id} className="py-2">
                  <Link
                    href={`/invoicing/${inv.id}/edit`}
                    className="flex items-center justify-between gap-4 text-sm hover:text-brand-600"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-brand-600">{inv.number}</span>
                      <span className="text-slate-500">{formatDate(inv.invoice_date)}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${
                          INVOICE_TONE[inv.status]
                        }`}
                      >
                        {inv.status}
                      </span>
                    </div>
                    <span className="font-medium text-slate-800">
                      {formatMoney(invoiceTotals(inv.items, inv.tax_rate).total)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
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
