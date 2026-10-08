// Registry of the data sources that feed PM-Central, for the admin Data page.
// Each source maps to the sync_status job(s) that record its freshness and to
// the GitHub Actions workflow that refreshes it on demand. Adding a new sync =
// add a row here (and have the sync write its sync_status heartbeat).

export type DataSource = {
  id: string;
  label: string;
  description: string;
  cadence: string; // human-readable schedule (for display)
  tier: "hourly" | "daily"; // machine-readable schedule, for the external scheduler
  jobs: string[]; // sync_status.job names; freshness = the OLDEST of these
  comingSoon?: boolean; // listed for visibility, but no refresh workflow yet
  dispatch: {
    owner: string;
    repo: string;
    workflow: string; // workflow file name
    ref: string; // branch the workflow runs from (default branch)
  };
};

export const DATA_SOURCES: DataSource[] = [
  {
    id: "properties",
    label: "Properties, leases & tenants",
    description: "Properties, units, owners, active leases, and tenants from Rentvine.",
    cadence: "Daily",
    tier: "daily",
    jobs: ["rentvine_core"],
    dispatch: { owner: "pland10", repo: "PM-Central", workflow: "sync-rentvine.yml", ref: "main" },
  },
  {
    id: "balances",
    label: "Delinquency balances",
    description: "Each lease's current outstanding balance (powers Delinquencies).",
    cadence: "Daily",
    tier: "daily",
    jobs: ["balances"],
    dispatch: { owner: "pland10", repo: "PM-Central", workflow: "sync-balances.yml", ref: "main" },
  },
  {
    id: "communications",
    label: "Communications — tasks & chat",
    description: "LeadSimple tasks and Rentvine chat messages.",
    cadence: "Hourly",
    tier: "hourly",
    jobs: ["tasks", "rentvine_chat"],
    dispatch: { owner: "pland10", repo: "leadsimple-search", workflow: "sync.yml", ref: "master" },
  },
  {
    id: "work_orders",
    label: "Work orders",
    description: "Work orders and their stages from LeadSimple.",
    cadence: "Hourly",
    tier: "hourly",
    jobs: ["work_orders"],
    dispatch: { owner: "pland10", repo: "leadsimple-search", workflow: "sync.yml", ref: "master" },
  },
  {
    id: "payments",
    label: "Payments & settlements",
    description: "Rentvine rent payments and ACH settlement status.",
    cadence: "Hourly",
    tier: "hourly",
    jobs: ["rent_settlements"],
    dispatch: { owner: "pland10", repo: "leadsimple-search", workflow: "sync.yml", ref: "master" },
  },
  {
    id: "emails",
    label: "Emails, notes, calls & texts",
    description: "Activity history crawled from LeadSimple (browser session).",
    cadence: "Hourly (business hrs), every 2h overnight",
    tier: "hourly",
    jobs: ["activity_refresh"],
    dispatch: { owner: "pland10", repo: "leadsimple-search", workflow: "backfill.yml", ref: "master" },
  },
];

export function getDataSource(id: string): DataSource | undefined {
  return DATA_SOURCES.find((s) => s.id === id);
}
