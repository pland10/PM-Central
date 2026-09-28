import type { RentvineExport, RentvineSource } from "./raw";

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

export function liveRentvineSource(config: RentvineAccountConfig): RentvineSource {
  return {
    async extract(): Promise<RentvineExport> {
      if (!config.apiKey || !config.apiSecret) {
        throw new Error(
          `Rentvine credentials missing for account "${config.account}". ` +
            `Set RENTVINE_${config.account.toUpperCase()}_API_KEY / _API_SECRET, ` +
            `or import from a bundled snapshot instead.`
        );
      }
      // TODO: implement against the Rentvine API.
      //   const base = `https://${config.subdomain}.rentvine.com/api/manager`;
      //   const auth = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64");
      //   fetch(`${base}/properties`, { headers: { Authorization: `Basic ${auth}` } })
      // Map the responses into RvProperty / RvLease / RvWorkOrder and return a
      // RentvineExport. Paginate through all pages so the import is complete.
      throw new Error("liveRentvineSource: Rentvine API extraction not implemented yet.");
    },
  };
}
