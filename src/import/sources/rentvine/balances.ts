import type { BalanceProvider, Balances } from "../balances";

// Rentvine balance provider (REST). Pulls the "Rent Roll Outstanding Balance"
// saved report over the Rentvine manager API (HTTP Basic auth) and returns each
// lease's current balance keyed by Rentvine leaseID.
//
// Env:
//   RENTVINE_BASE_URL      e.g. https://pmilighthouse.rentvine.com/api/manager
//   RENTVINE_API_KEY
//   RENTVINE_API_SECRET
//   RENTVINE_BALANCE_REPORT_ID   optional, default 27

type ReportRow = { rowTypeID?: number; data?: Record<string, unknown> };

function money(v: unknown): number {
  const n = parseFloat(String(v ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export class RentvineRestProvider implements BalanceProvider {
  readonly name = "rentvine";

  async getBalances(): Promise<Balances> {
    const base = (process.env.RENTVINE_BASE_URL || "").replace(/\/+$/, "");
    const key = process.env.RENTVINE_API_KEY || "";
    const secret = process.env.RENTVINE_API_SECRET || "";
    const reportId = process.env.RENTVINE_BALANCE_REPORT_ID || "27";

    if (!base || !key || !secret) {
      throw new Error(
        "Missing Rentvine credentials. Set RENTVINE_BASE_URL, RENTVINE_API_KEY, and " +
          "RENTVINE_API_SECRET (see .env.example)."
      );
    }

    const url = `${base}/reports/rent-roll?exportTypeID=1&orientation=2&showHeader=true&reportID=${reportId}`;
    const auth = Buffer.from(`${key}:${secret}`).toString("base64");

    const res = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Basic ${auth}` },
    });
    if (!res.ok) {
      throw new Error(`Rentvine report request failed: HTTP ${res.status} ${res.statusText}`);
    }
    const json = await res.json();

    // Tolerate either { rows: [{ data: {...} }] } or a flat array of row data.
    const rawRows: ReportRow[] = Array.isArray(json)
      ? (json as ReportRow[])
      : Array.isArray(json?.rows)
        ? (json.rows as ReportRow[])
        : [];

    const balances: Balances = new Map();
    for (const row of rawRows) {
      const d = row.data ?? (row as Record<string, unknown>);
      const leaseId = d?.leaseID ?? d?.leaseId;
      if (leaseId == null || leaseId === "") continue;
      balances.set(String(leaseId), money(d?.balanceDue));
    }
    return balances;
  }
}
