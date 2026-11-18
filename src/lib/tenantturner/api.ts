import { lowerKeys, type TtRecord } from "@/lib/tenantturner/sync";

// Tenant Turner REST API (https://api.tenantturner.com/v1). Auth is the API key
// as a Basic-auth value: Authorization: Basic base64(key). Calls verified in
// leadsimple-search's tenantturner_showings_backfill.py. Responses come back in
// PascalCase (Data, NextPage, ApplicationId, …); every record is returned
// lower-keyed (see lowerKeys).

export type TenantTurnerConfig = { apiKey: string; baseUrl: string; customerId: string | null };

export function tenantTurnerConfig(): TenantTurnerConfig {
  return {
    apiKey: process.env.TENANT_TURNER_API_KEY ?? "",
    baseUrl: (process.env.TENANT_TURNER_BASE_URL || "https://api.tenantturner.com").replace(/\/+$/, ""),
    customerId: process.env.TENANT_TURNER_CUSTOMER_ID || null,
  };
}

const MAX_PAGES = 200; // 100 per page — far beyond any real backlog

// The list inside a response, whatever it's called (Data / Items / a bare array).
function listOf(resp: unknown): unknown[] {
  if (Array.isArray(resp)) return resp;
  const r = lowerKeys(resp);
  for (const k of ["data", "items", "results", "records", "applications", "properties"]) {
    if (Array.isArray(r[k])) return r[k] as unknown[];
  }
  return Object.values(r).find(Array.isArray) ?? [];
}

export function tenantTurnerApi(cfg: TenantTurnerConfig, fetchImpl: typeof fetch = fetch) {
  const auth = `Basic ${Buffer.from(cfg.apiKey).toString("base64")}`;

  async function get(path: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(cfg.baseUrl + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (cfg.customerId) url.searchParams.set("customerId", cfg.customerId);
    const res = await fetchImpl(url.toString(), { headers: { Authorization: auth, Accept: "application/json" } });
    // Status only in the message — never the body, which can carry lead details.
    if (!res.ok) throw new Error(`Tenant Turner GET ${path} -> HTTP ${res.status}`);
    return res.json();
  }

  return {
    async listProperties(): Promise<TtRecord[]> {
      return listOf(await get("/v1/properties", { onlyIncludeActive: "false" })).map(lowerKeys);
    },

    // Every application (lead) updated since `sinceIso`, all pages.
    async listChangedApplications(sinceIso: string): Promise<TtRecord[]> {
      const out: TtRecord[] = [];
      let next: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        const params: Record<string, string> = { Limit: "100", SinceDateUpdated: sinceIso };
        if (next) params.NextPage = next;
        const resp = await get("/v1/applications", params);
        out.push(...listOf(resp).map(lowerKeys));
        const np = lowerKeys(resp).nextpage;
        next = typeof np === "string" && np ? np : typeof np === "number" ? String(np) : null;
        if (!next) return out;
      }
      throw new Error("Tenant Turner applications: too many pages");
    },

    async getApplication(id: string): Promise<TtRecord | null> {
      const resp = lowerKeys(await get(`/v1/applications/${encodeURIComponent(id)}`));
      const data = resp.data;
      return data && typeof data === "object" && !Array.isArray(data) ? lowerKeys(data) : resp;
    },
  };
}
