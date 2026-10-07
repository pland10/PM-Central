import { PrismaClient, Prisma } from "@prisma/client";
import { liveRentvineSource, accountConfigFromEnv } from "../src/import/sources/rentvine/client";
import { rentvineToCanonical } from "../src/import/sources/rentvine/transform";
import { loadCanonical } from "../src/import/load";

// Live Rentvine core sync — pulls properties, units, owners, active leases and
// tenants from the Rentvine API and reconciles them into the DB:
//
//   npm run sync:rentvine                 # default account (pmilighthouse)
//   npm run sync:rentvine -- <account>    # a specific account
//
// Runs daily (and on demand from the admin Data page / Actions tab). Unlike
// `npm run import` (which replaces everything from a bundled snapshot), this
// uses the loader's "sync" mode: it upserts and then removes only records that
// vanished from Rentvine (ended leases, removed properties). It does NOT touch
// work orders or a property's group tags — those are synced separately, so a
// core sync never wipes them.
//
// Creds: RENTVINE_{ACCOUNT}_API_KEY / _API_SECRET / _SUBDOMAIN, falling back to
// RENTVINE_API_KEY / _API_SECRET (see accountConfigFromEnv).

async function main() {
  const account = process.argv[2] ?? process.env.RENTVINE_ACCOUNT ?? "pmilighthouse";
  const config = accountConfigFromEnv(account);

  console.log(`Extracting "${account}" from Rentvine (${config.subdomain}.rentvine.com)…`);
  const raw = await liveRentvineSource(config).extract();
  console.log(
    `Extracted ${raw.properties.length} properties, ${raw.activeLeases.length} active leases.`
  );

  // Safety: never let an upstream hiccup (0 properties) trigger the orphan
  // sweep. loadCanonical also guards on this, but fail loud here too.
  if (raw.properties.length === 0) {
    throw new Error("Rentvine returned 0 properties — aborting to avoid wiping existing data.");
  }

  const dataset = rentvineToCanonical(raw);

  const prisma = new PrismaClient();
  try {
    const counts = await loadCanonical(prisma, dataset, { mode: "sync" });
    console.log(`Synced "${account}" from rentvine:`, counts);

    // Heartbeat for the admin Data page (never fatal).
    try {
      const detail = `${counts.properties} properties, ${counts.leases} leases, ${counts.tenants} tenants`;
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO sync_status (job, last_run_at, detail)
        VALUES ('rentvine_core', now(), ${detail})
        ON CONFLICT (job) DO UPDATE
          SET last_run_at = EXCLUDED.last_run_at, detail = EXCLUDED.detail`);
    } catch (e) {
      console.log(
        `  [warn] could not write sync_status heartbeat: ${e instanceof Error ? e.message : e}`
      );
    }

    console.log("\nDone. Reload the app to see refreshed properties, leases and tenants.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("\nSync failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
