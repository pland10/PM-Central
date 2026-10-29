import { notFound } from "next/navigation";

// Feature flags — turn modules on/off per deployment so the product can be sold
// in pieces. Shipped modules default ON; disable one by setting its env var to
// off/false/0/no, e.g. FEATURE_INVOICING=off. Modules still being built default
// OFF and are turned on with on/true/1/yes (e.g. FEATURE_MAINTENANCE=on).
// Read server-side.
export type FeatureKey =
  | "dashboard"
  | "properties"
  | "squatterWatch"
  | "portfolios"
  | "leases"
  | "tenants"
  | "workOrders"
  | "maintenance"
  | "showings"
  | "search"
  | "teamComms"
  | "inspections"
  | "invoicing"
  | "securityDeposits"
  | "accounting";

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
  // New work-order screen (replacing Work Orders); side by side until it's done.
  maintenance: flag("MAINTENANCE", false),
  showings: flag("SHOWINGS"),
  search: flag("SEARCH"),
  teamComms: flag("TEAM_COMMS"),
  inspections: flag("INSPECTIONS"),
  invoicing: flag("INVOICING"),
  securityDeposits: flag("SECURITY_DEPOSITS"),
  // Live accounting roll-up (cash on hand + reimbursables) from Rentvine.
  accounting: flag("ACCOUNTING"),
};

export function isFeatureEnabled(key: FeatureKey): boolean {
  return FEATURES[key];
}

// Call at the top of a route's page/handler to 404 when its module is disabled.
export function requireFeature(key: FeatureKey): void {
  if (!FEATURES[key]) notFound();
}
