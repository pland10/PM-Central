import { PrismaClient } from "@prisma/client";
import type { CanonicalDataset } from "./canonical";

// The generic import. Takes a canonical dataset from ANY source and upserts it
// into our database, keyed on (source, externalId), so re-running is idempotent
// — no duplicates, updates in place. This file has no knowledge of Rentvine or
// any specific PMS.

export interface LoadOptions {
  // When true, first remove this account's existing records for this source
  // (safe for multi-company: other accounts are untouched). When false, pure
  // upsert. A full local reset is done by the caller (see prisma/seed.ts).
  fresh?: boolean;
  // "replace" (default): the fresh/upsert behavior above — used by the static
  // import + seed, which carry the complete dataset (properties, leases, AND
  // work orders + group tags).
  // "sync": non-destructive live refresh. Upserts properties/units/leases/
  // tenants, then sweeps away only the ones that vanished from the source
  // (ended leases, removed properties). It deliberately does NOT touch work
  // orders, and preserves a property's existing tags when the source row
  // carries none — so a partial live sync never wipes data it isn't
  // responsible for. See scripts/sync-rentvine.ts.
  mode?: "replace" | "sync";
}

export interface LoadCounts {
  properties: number;
  units: number;
  leases: number;
  tenants: number;
  workOrders: number;
}

// Namespace an id by account so companies/PMSs never collide on externalId.
function ns(account: string, type: string, externalId: string): string {
  return `${account}:${type}:${externalId}`;
}

export async function loadCanonical(
  prisma: PrismaClient,
  dataset: CanonicalDataset,
  opts: LoadOptions = {}
): Promise<LoadCounts> {
  const { source, account } = dataset;
  const prefix = `${account}:`;
  const syncMode = opts.mode === "sync";

  // In sync mode we track every namespaced id we touch so we can delete the
  // records that disappeared from the source afterwards (orphan sweep).
  const seenProps: string[] = [];
  const seenUnits: string[] = [];
  const seenLeases: string[] = [];

  if (opts.fresh) {
    // Scoped reset: only this source + account. Property deletes cascade to
    // units, leases, and lease-tenant links.
    await prisma.workOrder.deleteMany({ where: { source, externalId: { startsWith: prefix } } });
    await prisma.property.deleteMany({ where: { source, externalId: { startsWith: prefix } } });
    await prisma.portfolio.deleteMany({ where: { source, externalId: { startsWith: prefix } } });
    await prisma.contact.deleteMany({ where: { source, externalId: { startsWith: prefix } } });
  }

  const counts: LoadCounts = { properties: 0, units: 0, leases: 0, tenants: 0, workOrders: 0 };
  const propIdByExt = new Map<string, string>();

  for (const p of dataset.properties) {
    // Owner / portfolio (ownership entity) — created first so the property can link to it.
    let portfolioId: string | null = null;
    if (p.owner) {
      const pfExt = ns(account, "portfolio", p.owner.externalId);
      const portfolio = await prisma.portfolio.upsert({
        where: { source_externalId: { source, externalId: pfExt } },
        create: { source, externalId: pfExt, name: p.owner.name },
        update: { name: p.owner.name },
      });
      portfolioId = portfolio.id;

      const ownerExt = ns(account, "owner", p.owner.externalId);
      const isCompany = /\b(llc|inc|corp|trust|holdings|rentals|family|company)\b/i.test(p.owner.name);
      const ownerFields = isCompany
        ? { companyName: p.owner.name, firstName: null, lastName: null }
        : {
            companyName: null,
            firstName: p.owner.name.split(/\s+/)[0],
            lastName: p.owner.name.split(/\s+/).slice(1).join(" ") || null,
          };
      const ownerContact = await prisma.contact.upsert({
        where: { source_externalId: { source, externalId: ownerExt } },
        create: { source, externalId: ownerExt, roles: "owner", ...ownerFields },
        update: ownerFields,
      });
      const link = await prisma.ownerLink.findUnique({
        where: { portfolioId_contactId: { portfolioId: portfolio.id, contactId: ownerContact.id } },
      });
      if (!link) {
        await prisma.ownerLink.create({
          data: { portfolioId: portfolio.id, contactId: ownerContact.id },
        });
      }
    }

    const externalId = ns(account, "property", p.externalId);
    const propData = {
      name: p.name ?? p.street1,
      street1: p.street1,
      street2: p.street2 ?? null,
      city: p.city,
      state: p.state,
      zip: p.zip,
      propertyType: p.propertyType,
      status: p.status,
      tags: (p.tags ?? []).join(","),
      portfolioId,
    };
    // In sync mode, don't overwrite existing tags when the source row carries
    // none — group/program tags (e.g. squatterwatch) are synced separately.
    const propUpdate: Record<string, unknown> = { ...propData };
    if (syncMode && (p.tags ?? []).length === 0) delete propUpdate.tags;
    const property = await prisma.property.upsert({
      where: { source_externalId: { source, externalId } },
      create: { source, externalId, ...propData },
      update: propUpdate,
    });
    propIdByExt.set(p.externalId, property.id);
    seenProps.push(externalId);
    counts.properties++;

    for (const u of p.units) {
      const uExt = ns(account, "unit", u.externalId);
      const unitData = {
        unitNumber: u.unitNumber,
        status: u.status,
        beds: u.beds ?? null,
        baths: u.baths ?? null,
        sqft: u.sqft ?? null,
        marketRent: u.marketRent ?? null,
      };
      const unit = await prisma.unit.upsert({
        where: { source_externalId: { source, externalId: uExt } },
        create: { source, externalId: uExt, propertyId: property.id, ...unitData },
        update: { propertyId: property.id, ...unitData },
      });
      seenUnits.push(uExt);
      counts.units++;

      if (u.lease) {
        const lExt = ns(account, "lease", u.lease.externalId);
        const leaseData = {
          status: u.lease.status,
          rent: u.lease.rent,
          balanceDue: u.lease.balanceDue ?? 0,
          depositBalance: u.lease.depositBalance ?? 0,
          startDate: u.lease.startDate ? new Date(u.lease.startDate) : null,
          endDate: u.lease.endDate ? new Date(u.lease.endDate) : null,
        };
        // In sync mode, don't overwrite the financial snapshot on update:
        // balanceDue is owned by the separate balance sync (sync-balances),
        // and depositBalance by the rent-roll import. The core sync has no
        // authoritative figures for them, so clobbering to 0 here would wipe
        // delinquencies. New leases still start at the defaults below.
        const leaseUpdate: Record<string, unknown> = { unitId: unit.id, ...leaseData };
        if (syncMode) {
          delete leaseUpdate.balanceDue;
          delete leaseUpdate.depositBalance;
        }
        const lease = await prisma.lease.upsert({
          where: { source_externalId: { source, externalId: lExt } },
          create: { source, externalId: lExt, unitId: unit.id, ...leaseData },
          update: leaseUpdate,
        });
        seenLeases.push(lExt);
        counts.leases++;

        for (let i = 0; i < u.lease.tenants.length; i++) {
          const t = u.lease.tenants[i];
          const tExt = ns(account, "contact", t.externalId);
          const tenantData = {
            firstName: t.firstName ?? null,
            lastName: t.lastName ?? null,
            companyName: t.companyName ?? null,
            email: t.email ?? null,
            phone: t.phone ?? null,
          };
          const contact = await prisma.contact.upsert({
            where: { source_externalId: { source, externalId: tExt } },
            create: { source, externalId: tExt, roles: "tenant", ...tenantData },
            update: tenantData,
          });
          counts.tenants++;

          const existing = await prisma.leaseTenant.findUnique({
            where: { leaseId_contactId: { leaseId: lease.id, contactId: contact.id } },
          });
          if (!existing) {
            await prisma.leaseTenant.create({
              data: { leaseId: lease.id, contactId: contact.id, isPrimary: i === 0 },
            });
          }
        }
      }
    }
  }

  for (const wo of dataset.workOrders) {
    const propertyId = propIdByExt.get(wo.propertyExternalId);
    if (!propertyId) continue; // work order references a property not in this dataset
    const woExt = ns(account, "wo", wo.externalId);
    const woData = {
      title: wo.title,
      description: wo.description ?? null,
      status: wo.status,
      priority: wo.priority,
    };
    await prisma.workOrder.upsert({
      where: { source_externalId: { source, externalId: woExt } },
      create: { source, externalId: woExt, propertyId, ...woData },
      update: { propertyId, ...woData },
    });
    counts.workOrders++;
  }

  // Sync mode: remove records that vanished from the source. Guarded on having
  // actually loaded properties, so an upstream API hiccup (0 rows) can never
  // wipe the table. Deletes cascade property -> unit -> lease -> lease-tenant,
  // so order from narrowest to widest. Work orders are intentionally left
  // alone (not part of this sync) except where their property is gone.
  if (syncMode && seenProps.length > 0) {
    await prisma.lease.deleteMany({
      where: { source, externalId: { startsWith: `${account}:lease:`, notIn: seenLeases } },
    });
    await prisma.unit.deleteMany({
      where: { source, externalId: { startsWith: `${account}:unit:`, notIn: seenUnits } },
    });
    await prisma.property.deleteMany({
      where: { source, externalId: { startsWith: `${account}:property:`, notIn: seenProps } },
    });
  }

  return counts;
}
