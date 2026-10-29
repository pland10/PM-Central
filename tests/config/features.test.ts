import { afterEach, describe, expect, it, vi } from "vitest";

// FEATURES is computed at import, so each case re-imports with fresh env.
async function load() {
  vi.resetModules();
  return import("@/config/features");
}

afterEach(() => vi.unstubAllEnvs());

describe("feature flags", () => {
  it("keeps existing modules on unless switched off", async () => {
    vi.stubEnv("FEATURE_WORK_ORDERS", "");
    expect((await load()).isFeatureEnabled("workOrders")).toBe(true);
    vi.stubEnv("FEATURE_WORK_ORDERS", "off");
    expect((await load()).isFeatureEnabled("workOrders")).toBe(false);
  });

  it("keeps the new Maintenance screen off until FEATURE_MAINTENANCE is turned on", async () => {
    vi.stubEnv("FEATURE_MAINTENANCE", "");
    expect((await load()).isFeatureEnabled("maintenance")).toBe(false);
    vi.stubEnv("FEATURE_MAINTENANCE", "on");
    expect((await load()).isFeatureEnabled("maintenance")).toBe(true);
  });

  it("keeps the Accounting screen off until FEATURE_ACCOUNTING is turned on (entitlement-gated)", async () => {
    vi.stubEnv("FEATURE_ACCOUNTING", "");
    expect((await load()).isFeatureEnabled("accounting")).toBe(false);
    vi.stubEnv("FEATURE_ACCOUNTING", "on");
    expect((await load()).isFeatureEnabled("accounting")).toBe(true);
  });
});
