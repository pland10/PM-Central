// Deep links back to the source system a record came from.
//
// Our externalId is namespaced as "<account>:<type>:<sourceId>" (see the import
// loader). For Rentvine, <account> is the subdomain, so we can rebuild the exact
// URL in that system. LeadSimple (and other sources) plug in here later.

const RENTVINE_PATHS: Record<string, (id: string) => string> = {
  property: (id) => `/properties/${id}`,
  unit: (id) => `/units/${id}`,
  lease: (id) => `/leases/${id}`,
  wo: (id) => `/maintenance/work-orders/${id}`,
  portfolio: (id) => `/portfolios/${id}`,
};

export type ExternalLink = { label: string; url: string };

export function externalLink(source: string, externalId: string | null): ExternalLink | null {
  if (!externalId) return null;
  const [account, type, sourceId] = externalId.split(":");
  if (!account || !type || !sourceId) return null;

  if (source === "rentvine") {
    const path = RENTVINE_PATHS[type]?.(sourceId);
    if (!path) return null;
    return { label: "Rentvine", url: `https://${account}.rentvine.com${path}` };
  }

  // Future: source === "leadsimple" -> build LeadSimple URLs here.
  return null;
}
