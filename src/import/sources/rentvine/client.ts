import type { RentvineExport, RentvineSource, RvLease, RvProperty } from "./raw";

// Live Rentvine extraction, per company account.
//
// Each company that uses Rentvine has its own subdomain + API credentials. This
// client is configured per account and returns the same RentvineExport shape as
// the bundled snapshot, so the transform + generic loader are unchanged whether
// data comes from a file or the live API.
//
// STATUS: scaffold. Wire in the Rentvine API endpoints + auth once credentials
// are available (see .env.example: RENTVINE_* per account). Until then, imports
// run from bundled snapshots via staticSource() and this is the documented seam
// for going live and for onboarding additional companies.

export interface RentvineAccountConfig {
  account: string; // e.g. "pmilighthouse"
  subdomain: string; // e.g. "pmilighthouse" -> https://pmilighthouse.rentvine.com
  apiKey: string;
  apiSecret: string;
}

export function accountConfigFromEnv(account: string): RentvineAccountConfig {
  const up = account.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const get = (suffix: string) =>
    process.env[`RENTVINE_${up}_${suffix}`] ?? process.env[`RENTVINE_${suffix}`] ?? "";
  return {
    account,
    subdomain: get("SUBDOMAIN") || account,
    apiKey: get("API_KEY"),
    apiSecret: get("API_SECRET"),
  };
}

// Rentvine's primary lease-status category id for the "Active" family (2;
// confirmed against list_lease_statuses). Pending (1) and Closed (6) are
// excluded — only currently-active leases flow into the app.
const ACTIVE_PRIMARY_STATUS = "2";

// Map Rentvine propertyTypeID -> the type NAME the transform's RV_TYPE table
// understands. Rentvine exposes ids, not names, on the property record. This is
// a best-effort fallback; the extractor first tries to fetch the live type list
// (see below) and only falls back to this table if that endpoint isn't present.
const PROPERTY_TYPE_NAMES: Record<string, string> = {
  "1": "Single Family Home",
};

function toNum(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toStr(v: unknown): string {
  return v == null ? "" : String(v);
}

// Low-level Rentvine Manager REST helpers (auth + pagination + row unwrap),
// shared by the core extractor and the work-order fetcher.
function rvHttp(config: RentvineAccountConfig) {
  const base = `https://${config.subdomain}.rentvine.com/api/manager`;
  const auth = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64");

  async function rvGet(path: string): Promise<{ json: unknown; headers: Headers }> {
    const res = await fetch(base + path, {
      headers: { Accept: "application/json", Authorization: `Basic ${auth}` },
    });
    if (!res.ok) {
      throw new Error(`Rentvine GET ${path} -> HTTP ${res.status} ${res.statusText}`);
    }
    return { json: await res.json(), headers: res.headers };
  }

  // Page through `?page=N` until the Pagination-Total-Pages header is exhausted
  // (falling back to "stop on empty page" if the header is absent).
  async function rvGetAll(path: string): Promise<Record<string, unknown>[]> {
    const sep = path.includes("?") ? "&" : "?";
    const rows: Record<string, unknown>[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const { json, headers } = await rvGet(`${path}${sep}page=${page}`);
      const arr = Array.isArray(json) ? (json as Record<string, unknown>[]) : [];
      rows.push(...arr);
      const tp = toNum(headers.get("Pagination-Total-Pages"));
      totalPages = tp && tp > 0 ? tp : page >= 1 && arr.length > 0 ? page + 1 : page;
      page++;
    } while (page <= totalPages);
    return rows;
  }

  // Rentvine wraps each row in a singular key (e.g. { property: {...} }). Pull
  // out the record whichever way it comes.
  function unwrap(row: Record<string, unknown>, key: string): Record<string, unknown> {
    const inner = row[key];
    return inner && typeof inner === "object" ? (inner as Record<string, unknown>) : row;
  }

  return { rvGet, rvGetAll, unwrap };
}

// Rentvine priorityID -> display name (confirmed against the work-order API:
// 1=Low, 2=Medium, 3=High).
const PRIORITY_NAMES: Record<string, string> = { "1": "Low", "2": "Medium", "3": "High" };

// A live Rentvine work order, reduced to the fields that enrich the LeadSimple
// work-order list. Keyed by `number` (= Rentvine workOrderNumber = the WO # that
// LeadSimple parses into work_orders.wo_number), which is the cross-source join.
export interface RvWorkOrderLive {
  number: string;
  propertyExternalId: string; // String(propertyID); matches Property.externalId
  priority: string; // Low | Medium | High | ""
}

// Fetch all work orders for an account from the Rentvine Manager API. Separate
// from the core extractor: work orders are their own sync (the core sync never
// touches them), and they feed a raw `rv_work_orders` table rather than Prisma.
export async function fetchRentvineWorkOrders(
  config: RentvineAccountConfig
): Promise<RvWorkOrderLive[]> {
  if (!config.apiKey || !config.apiSecret) {
    throw new Error(
      `Rentvine credentials missing for account "${config.account}". ` +
        `Set RENTVINE_${config.account.toUpperCase()}_API_KEY / _API_SECRET.`
    );
  }
  const { rvGetAll, unwrap } = rvHttp(config);
  const rows = await rvGetAll("/maintenance/work-orders");
  const out: RvWorkOrderLive[] = [];
  for (const row of rows) {
    const w = unwrap(row, "workOrder");
    const number = toStr(w.workOrderNumber);
    if (!number) continue;
    out.push({
      number,
      propertyExternalId: toStr(w.propertyID),
      priority: PRIORITY_NAMES[toStr(w.priorityID)] ?? "",
    });
  }
  return out;
}

export function liveRentvineSource(config: RentvineAccountConfig): RentvineSource {
  const { rvGet, rvGetAll, unwrap } = rvHttp(config);

  async function loadPropertyTypeNames(): Promise<Record<string, string>> {
    for (const path of ["/property-types", "/propertyTypes"]) {
      try {
        const rows = await rvGetAll(path);
        const map: Record<string, string> = {};
        for (const row of rows) {
          const t = unwrap(row, "propertyType");
          const id = toStr(t.propertyTypeID ?? t.id);
          const name = toStr(t.name);
          if (id && name) map[id] = name;
        }
        if (Object.keys(map).length) return map;
      } catch {
        // endpoint not available on this account — try the next spelling
      }
    }
    return PROPERTY_TYPE_NAMES;
  }

  return {
    async extract(): Promise<RentvineExport> {
      if (!config.apiKey || !config.apiSecret) {
        throw new Error(
          `Rentvine credentials missing for account "${config.account}". ` +
            `Set RENTVINE_${config.account.toUpperCase()}_API_KEY / _API_SECRET, ` +
            `or import from a bundled snapshot instead.`
        );
      }

      const [propRows, pfRows, leaseRows, typeNames] = await Promise.all([
        rvGetAll("/properties"),
        rvGetAll("/portfolios"),
        rvGetAll("/leases"),
        loadPropertyTypeNames(),
      ]);

      // portfolioID -> owner (portfolio) name, for the owning entity.
      const ownerByPortfolio = new Map<string, string>();
      for (const row of pfRows) {
        const pf = unwrap(row, "portfolio");
        const id = toStr(pf.portfolioID);
        const name = toStr(pf.name);
        if (id && name) ownerByPortfolio.set(id, name);
      }

      const properties: RvProperty[] = propRows.map((row) => {
        const p = unwrap(row, "property");
        const portfolioId = toNum(p.portfolioID);
        const typeId = toStr(p.propertyTypeID);
        return {
          id: Number(p.propertyID),
          street: toStr(p.address),
          city: toStr(p.city),
          state: toStr(p.stateID),
          zip: toStr(p.postalCode),
          type: typeNames[typeId] ?? typeId,
          portfolioId,
          owner: portfolioId != null ? ownerByPortfolio.get(String(portfolioId)) : undefined,
          status: toStr(p.isActive) === "0" ? "inactive" : "active",
        };
      });

      // Active leases only. Rent + deposit come off the embedded unit; dates and
      // the primary tenant name are on the lease itself.
      const activeLeases: RvLease[] = [];
      for (const row of leaseRows) {
        const l = unwrap(row, "lease");
        if (toStr(l.primaryLeaseStatusID) !== ACTIVE_PRIMARY_STATUS) continue;
        const unit = unwrap(row, "unit");
        const tenants = Array.isArray(l.tenants) ? (l.tenants as unknown[]) : [];
        activeLeases.push({
          prop: Number(l.propertyID),
          leaseId: toNum(l.leaseID),
          tenant: toStr(tenants[0]),
          start: toStr(l.startDate),
          end: toStr(l.endDate),
          rent: toNum(unit.rent) ?? toNum(l.rentAmount) ?? toNum(l.baseRentAmount),
          depositBalance: toNum(unit.deposit),
        });
      }

      // Enrich each active lease's primary tenant with email/phone from the
      // lease's contact link. Best-effort: a failure keeps the name-only tenant.
      for (const lease of activeLeases) {
        if (lease.leaseId == null) continue;
        try {
          const { json } = await rvGet(`/leases/${lease.leaseId}/tenants`);
          const rows = Array.isArray(json) ? (json as Record<string, unknown>[]) : [];
          const primary =
            rows.find((r) => toStr(unwrap(r, "leaseTenant").isPrimary) === "1") ?? rows[0];
          const contact = primary ? unwrap(primary, "contact") : undefined;
          if (contact) {
            lease.tenant = toStr(contact.name) || lease.tenant;
            lease.email = contact.email ? toStr(contact.email) : undefined;
            lease.phone = contact.phone ? toStr(contact.phone) : undefined;
          }
        } catch {
          // keep the name from the lease row
        }
      }

      // Work orders + property-group tags are synced separately (they need their
      // own Rentvine endpoints) and the "sync" load mode preserves them, so they
      // are left empty here rather than wiped.
      return { account: config.account, properties, activeLeases, workOrders: [] };
    },
  };
}
