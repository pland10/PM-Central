import { PrismaClient } from "@prisma/client";
import { runTenantTurnerSync } from "../src/lib/tenantturner/sync";
import { liveTenantTurnerDeps, pruneShowingsBefore } from "../src/lib/tenantturner/sync-live";

// Tenant Turner showings, run by hand (the "Sync Tenant Turner showings"
// workflow): a backfill from a start date, an optional one-time cleanup of
// older showings, and the field names Tenant Turner returns (to see whether it
// exposes prospect messages). The scheduled sync is /api/cron/tenantturner.
//
//   TT_SINCE=2026-11-01 TT_PRUNE_BEFORE=2026-11-01 npm run sync:tenantturner
//
// Prints counts and field NAMES only — never lead details (Actions logs are public).

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function dateEnv(name: string): string | undefined {
  const v = (process.env[name] ?? "").trim();
  if (!v) return undefined;
  if (!DATE.test(v)) throw new Error(`${name} must be YYYY-MM-DD, got "${v}"`);
  return v;
}

async function main() {
  if (!process.env.TENANT_TURNER_API_KEY) throw new Error("Set TENANT_TURNER_API_KEY.");
  const since = dateEnv("TT_SINCE");
  const pruneBefore = dateEnv("TT_PRUNE_BEFORE");

  const prisma = new PrismaClient();
  try {
    if (pruneBefore) {
      const n = await pruneShowingsBefore(prisma, pruneBefore);
      console.log(`Deleted ${n} Tenant Turner showing(s) created before ${pruneBefore}.`);
    }
    const result = await runTenantTurnerSync(
      liveTenantTurnerDeps(prisma, {
        sinceOverride: since ? `${since}T00:00:00.000Z` : undefined,
        onFields: (appKeys, showingKeys) => {
          console.log(`Application fields (${appKeys.length}): ${appKeys.join(", ")}`);
          console.log(`Showing fields (${showingKeys.length}): ${showingKeys.join(", ")}`);
        },
      })
    );
    console.log(
      `Since ${result.since}: ${result.applications} application(s) changed, ${result.showings} showing(s) upserted ` +
        `(${result.linked} linked to a property), ${result.failed} application(s) unreadable.`
    );
    if (result.failed) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
