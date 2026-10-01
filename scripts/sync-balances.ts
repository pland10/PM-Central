import { PrismaClient } from "@prisma/client";
import { getBalanceProvider } from "../src/import/sources/balances";

// Live balance sync — pull every lease's current outstanding balance from the
// configured PMS and write it onto the matching leases in the DB:
//
//   npm run sync:balances
//
// The data source is a BalanceProvider (src/import/sources/balances.ts),
// selected by PMS_PROVIDER (default "rentvine"). This keeps the sync portable:
// onboarding another PMS = add a provider, this script is unchanged.
//
// It updates the DB directly (the dashboard reads Lease.balanceDue), so after a
// sync just reload the app — no re-import needed. NOTE: re-running `npm run
// import` reloads the static snapshot and will reset balances, so run this sync
// again after any import.

async function main() {
  const account = process.env.RENTVINE_ACCOUNT || "pmilighthouse";
  const source = "rentvine";
  const prefix = `${account}:lease:`;

  const provider = getBalanceProvider();
  console.log(`Fetching outstanding balances via "${provider.name}" provider…`);
  const balances = await provider.getBalances();
  console.log(`Provider returned ${balances.size} leases with a balance.`);

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
    console.log(
      `Total outstanding:           $${total.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    );
    if (unmatched.length) {
      console.log("");
      console.log(
        `⚠ ${unmatched.length} lease(s) in the report had no matching lease in the DB ` +
          `(ids: ${unmatched.join(", ")}). Likely leases not in the current snapshot — ` +
          `run \`npm run import\` if you expect them, then sync again.`
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
