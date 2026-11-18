import { afterEach, describe, expect, it, vi } from "vitest";
import { tenantTurnerApi, tenantTurnerConfig } from "@/lib/tenantturner/api";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("tenantTurnerConfig", () => {
  it("reads the key, optional base URL and customer id from the environment", () => {
    vi.stubEnv("TENANT_TURNER_API_KEY", "k");
    vi.stubEnv("TENANT_TURNER_BASE_URL", "https://tt.example/");
    vi.stubEnv("TENANT_TURNER_CUSTOMER_ID", "42");
    expect(tenantTurnerConfig()).toEqual({ apiKey: "k", baseUrl: "https://tt.example", customerId: "42" });
    vi.stubEnv("TENANT_TURNER_BASE_URL", "");
    vi.stubEnv("TENANT_TURNER_CUSTOMER_ID", "");
    expect(tenantTurnerConfig()).toEqual({ apiKey: "k", baseUrl: "https://api.tenantturner.com", customerId: null });
  });
});

describe("tenantTurnerApi", () => {
  it("sends the key as Basic auth and pages through changed applications", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ Data: [{ ApplicationId: 1 }], NextPage: "p2" }))
      .mockResolvedValueOnce(json({ Data: [{ ApplicationId: 2 }], NextPage: null }));
    const api = tenantTurnerApi({ apiKey: "secret", baseUrl: "https://tt.example", customerId: "42" }, fetchMock);
    const apps = await api.listChangedApplications("2026-11-01T00:00:00.000Z");
    expect(apps).toEqual([{ applicationid: 1 }, { applicationid: 2 }]);

    const [url1, init1] = fetchMock.mock.calls[0];
    const u1 = new URL(url1);
    expect(u1.pathname).toBe("/v1/applications");
    expect(u1.searchParams.get("SinceDateUpdated")).toBe("2026-11-01T00:00:00.000Z");
    expect(u1.searchParams.get("Limit")).toBe("100");
    expect(u1.searchParams.get("customerId")).toBe("42");
    expect(init1.headers.Authorization).toBe(`Basic ${Buffer.from("secret").toString("base64")}`);
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get("NextPage")).toBe("p2");
  });

  it("lists every property, active or not", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json([{ PropertyId: 7, Address: "1 Main" }]));
    const api = tenantTurnerApi({ apiKey: "k", baseUrl: "https://tt.example", customerId: null }, fetchMock);
    expect(await api.listProperties()).toEqual([{ propertyid: 7, address: "1 Main" }]);
    const u = new URL(fetchMock.mock.calls[0][0]);
    expect(u.pathname).toBe("/v1/properties");
    expect(u.searchParams.get("onlyIncludeActive")).toBe("false");
    expect(u.searchParams.has("customerId")).toBe(false);
  });

  it("reads one application, unwrapping a Data envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ Data: { ApplicationId: 5, Showings: [] } }));
    const api = tenantTurnerApi({ apiKey: "k", baseUrl: "https://tt.example", customerId: null }, fetchMock);
    expect(await api.getApplication("5")).toEqual({ applicationid: 5, showings: [] });
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe("/v1/applications/5");
  });

  it("throws on an HTTP error, with the status only", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("nope", { status: 401 }));
    const api = tenantTurnerApi({ apiKey: "k", baseUrl: "https://tt.example", customerId: null }, fetchMock);
    await expect(api.listProperties()).rejects.toThrow("Tenant Turner GET /v1/properties -> HTTP 401");
  });

  it("stops paging after a sane number of pages", async () => {
    const fetchMock = vi.fn(async () => json({ Data: [{ ApplicationId: 1 }], NextPage: "again" }));
    const api = tenantTurnerApi({ apiKey: "k", baseUrl: "https://tt.example", customerId: null }, fetchMock);
    await expect(api.listChangedApplications("2026-11-01T00:00:00.000Z")).rejects.toThrow(/too many pages/);
  });
});
