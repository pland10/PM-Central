// Portable balance sync — the seam that keeps outstanding-balance refresh
// PMS-agnostic, mirroring the source-agnostic import pipeline.
//
// A BalanceProvider knows how to pull current balances from ONE property-
// management system and return them keyed by that system's NATIVE lease id.
// The shared sync script (scripts/sync-balances.ts) matches those ids onto our
// leases and writes the DB — it never knows which PMS the numbers came from.
//
// Adding another PMS (AppFolio, etc.) = add a provider here; nothing downstream
// changes. A provider can talk REST (like Rentvine today), or later an MCP
// client, or anything else — the interface is all the sync depends on.

// native lease id (as the PMS exposes it) -> current balance owed
export type Balances = Map<string, number>;

export interface BalanceProvider {
  readonly name: string;
  getBalances(): Promise<Balances>;
}

import { RentvineRestProvider } from "./rentvine/balances";

// Registry of known providers. Selected by PMS_PROVIDER (default "rentvine").
const PROVIDERS: Record<string, () => BalanceProvider> = {
  rentvine: () => new RentvineRestProvider(),
};

export function getBalanceProvider(name?: string): BalanceProvider {
  const key = (name || process.env.PMS_PROVIDER || "rentvine").toLowerCase();
  const make = PROVIDERS[key];
  if (!make) {
    throw new Error(
      `Unknown PMS provider "${key}". Known: ${Object.keys(PROVIDERS).join(", ")}.`
    );
  }
  return make();
}
