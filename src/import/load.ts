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
    const property = await prisma.property.upsert({
      where: { source_externalId: { source, externalId } },
      create: { source, externalId, ...propData },
      update: propData,
    });
    propIdByExt.set(p.externalId, property.id);
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
        const lease = await prisma.lease.upsert({
          where: { source_externalId: { source, externalId: lExt } },
          create: { source, externalId: lExt, unitId: unit.id, ...leaseData },
          update: { unitId: unit.id, ...leaseData },
        });
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

  return counts;
}
