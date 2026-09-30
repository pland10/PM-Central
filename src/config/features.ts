import { notFound } from "next/navigation";

// Feature flags — turn modules on/off per deployment so the product can be sold
// in pieces. Every module defaults ON; disable one by setting its env var to
// off/false/0/no, e.g. FEATURE_INVOICING=off. Read server-side.
export type FeatureKey =
  | "dashboard"
  | "properties"
  | "squatterWatch"
  | "portfolios"
  | "leases"
  | "tenants"
  | "workOrders"
  | "search"
  | "inspections"
  | "invoicing";

function flag(envName: string, defaultOn = true): boolean {
  const v = process.env[`FEATURE_${envName}`];
  if (v == null || v.trim() === "") return defaultOn;
  return !["0", "false", "off", "no"].includes(v.trim().toLowerCase());
}

export const FEATURES: Record<FeatureKey, boolean> = {
  dashboard: flag("DASHBOARD"),
  properties: flag("PROPERTIES"),
  squatterWatch: flag("SQUATTER_WATCH"),
  portfolios: flag("PORTFOLIOS"),
  leases: flag("LEASES"),
  tenants: flag("TENANTS"),
  workOrders: flag("WORK_ORDERS"),
  search: flag("SEARCH"),
  inspections: flag("INSPECTIONS"),
  invoicing: flag("INVOICING"),
};

export function isFeatureEnabled(key: FeatureKey): boolean {
  return FEATURES[key];
}

// Call at the top of a route's page/handler to 404 when its module is disabled.
export function requireFeature(key: FeatureKey): void {
  if (!FEATURES[key]) notFound();
}
