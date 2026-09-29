import type { CanonicalDataset, CanonicalProperty } from "../../canonical";
import type { RentvineExport, RvLease } from "./raw";
import { tagSlug } from "@/lib/programs";

// Rentvine -> canonical. This is the ONLY Rentvine-specific mapping. Another PMS
// would have its own transform producing the same CanonicalDataset.

const RV_TYPE: Record<string, string> = {
  "Single Family Home": "single-family",
  Apartment: "apartment",
  Condo: "condo",
  Townhouse: "townhouse",
  Commercial: "commercial",
  Multiplex: "multi-family",
};

function nameParts(name: string) {
  const isCompany = /\b(llc|inc|corp|services|company)\b/i.test(name);
  if (isCompany) return { companyName: name };
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || null };
}

export function rentvineToCanonical(data: RentvineExport): CanonicalDataset {
  const leasesByProp = new Map<number, RvLease[]>();
  for (const l of data.activeLeases) {
    const arr = leasesByProp.get(l.prop) ?? [];
    arr.push(l);
    leasesByProp.set(l.prop, arr);
  }

  const properties: CanonicalProperty[] = data.properties.map((p) => {
    const leases = leasesByProp.get(p.id) ?? [];
    const units =
      leases.length === 0
        ? [{ externalId: `${p.id}-1`, unitNumber: "1", status: "vacant", lease: null }]
        : leases.map((l, i) => ({
            externalId: `${p.id}-${i + 1}`,
            unitNumber: String(i + 1),
            status: "occupied",
            lease: {
              externalId: l.leaseId != null ? String(l.leaseId) : `${p.id}-${i + 1}`,
              status: "active",
              rent: l.rent ?? 0,
              balanceDue: l.balanceDue ?? 0,
              depositBalance: l.depositBalance ?? 0,
              startDate: l.start,
              endDate: l.end,
              tenants: [
                {
                  externalId: `${p.id}-${i + 1}-t`,
                  email: l.email ?? null,
                  phone: l.phone ?? null,
                  ...nameParts(l.tenant),
                },
              ],
            },
          }));

    return {
      externalId: String(p.id),
      name: p.street,
      street1: p.street,
      city: p.city,
      state: p.state,
      zip: p.zip,
      propertyType: RV_TYPE[p.type] ?? p.type,
      status: "active",
      tags: (p.groups ?? []).map(tagSlug),
      owner:
        p.owner && p.portfolioId != null
          ? { externalId: String(p.portfolioId), name: p.owner }
          : null,
      units,
    };
  });

  const workOrders = data.workOrders.map((w) => ({
    externalId: String(w.id),
    propertyExternalId: String(w.prop),
    title: w.desc.length > 60 ? w.desc.slice(0, 57) + "…" : w.desc,
    description: w.desc,
    status: "open",
    priority: w.priority,
  }));

  return { source: "rentvine", account: data.account, properties, workOrders };
}
