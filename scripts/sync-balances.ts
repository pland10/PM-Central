import { PrismaClient } from "@prisma/client";

// Live balance sync:  pull every lease's current balance from Rentvine's
// "Rent Roll Outstanding Balance" saved report and write it onto the matching
// leases in the DB. This is the one-command refresh for outstanding balances:
//
//   npm run sync:balances
//
// It updates the DB directly (the dashboard reads Lease.balanceDue), so after a
// sync just reload the app — no re-import needed. NOTE: re-running `npm run
// import` reloads the static snapshot and will reset balances, so run this sync
// again after any import.
//
// Requires Rentvine API credentials (same kind the invoicing/inspection apps
// use) in the environment:
//   RENTVINE_BASE_URL      e.g. https://pmilighthouse.rentvine.com/api/manager
//   RENTVINE_API_KEY
//   RENTVINE_API_SECRET
// Optional:
//   RENTVINE_BALANCE_REPORT_ID   saved report id (default 27)
//   RENTVINE_ACCOUNT             account namespace (default "pmilighthouse")

type ReportRow = { rowTypeID?: number; data?: Record<string, unknown> };

function money(v: unknown): number {
  const n = parseFloat(String(v ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function fetchBalances(): Promise<Map<string, number>> {
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

  const url =
    `${base}/reports/rent-roll?exportTypeID=1&orientation=2&showHeader=true&reportID=${reportId}`;
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

  const balances = new Map<string, number>();
  for (const row of rawRows) {
    const d = row.data ?? (row as Record<string, unknown>);
    const leaseId = d?.leaseID ?? d?.leaseId;
    if (leaseId == null || leaseId === "") continue;
    balances.set(String(leaseId), money(d?.balanceDue));
  }
  return balances;
}

async function main() {
  const account = process.env.RENTVINE_ACCOUNT || "pmilighthouse";
  const source = "rentvine";
  const prefix = `${account}:lease:`;

  console.log("Fetching outstanding balances from Rentvine…");
  const balances = await fetchBalances();
  console.log(`Report returned ${balances.size} leases with a balance.`);

  const prisma = new PrismaClient();
  try {
    const leases = await prisma.lease.findMany({
      where: { source, externalId: { startsWith: prefix } },
      select: { id: true, externalId: true, balanceDue: true },
    });

    let updated = 0;
    let zeroed = 0;
    let total = 0;
    const matchedLeaseIds = new Set<string>();

    for (const lease of leases) {
      const leaseId = lease.externalId!.slice(prefix.length);
      const next = balances.get(leaseId) ?? 0;
      if (balances.has(leaseId)) matchedLeaseIds.add(leaseId);
      total += next;

      if (next !== lease.balanceDue) {
        await prisma.lease.update({ where: { id: lease.id }, data: { balanceDue: next } });
        if (next === 0) zeroed++;
        else updated++;
      }
    }

    const unmatched = [...balances.keys()].filter((id) => !matchedLeaseIds.has(id));

    console.log("");
    console.log(`Leases in DB (${account}):   ${leases.length}`);
    console.log(`Balances changed:            ${updated}`);
    console.log(`Cleared to $0 (paid off):    ${zeroed}`);
    console.log(`Total outstanding:           $${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    if (unmatched.length) {
      console.log("");
      console.log(
        `⚠ ${unmatched.length} lease(s) in the report had no matching lease in the DB ` +
          `(leaseIDs: ${unmatched.join(", ")}). These are likely leases not in the ` +
          `current snapshot — run \`npm run import\` if you expect them, then sync again.`
      );
    }
    console.log("\nDone. Reload the dashboard to see updated balances.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("\nSync failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
