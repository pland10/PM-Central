import { PrismaClient, Prisma } from "@prisma/client";
import { fetchRentvineWorkOrders, accountConfigFromEnv } from "../src/import/sources/rentvine/client";

// Live Rentvine work-order sync. Work orders are managed in LeadSimple (the
// stage is what the team follows), but Rentvine is the system of record for the
// work order itself — property, priority, cost. This pulls Rentvine's work
// orders into a raw `rv_work_orders` table keyed by the work-order NUMBER
// (= LeadSimple's work_orders.wo_number), so the Work Orders page can merge the
// two on that number and show a clickable property + priority.
//
//   npm run sync:rentvine:wos                 # default account (pmilighthouse)
//   npm run sync:rentvine:wos -- <account>    # a specific account
//
// Separate from the core sync (which never touches work orders). Writes raw SQL
// rather than Prisma — the table is a derived mirror with no FKs, like the
// LeadSimple-fed work_orders / payments / activities tables.
//
// Creds: RENTVINE_{ACCOUNT}_API_KEY / _API_SECRET / _SUBDOMAIN, falling back to
// RENTVINE_API_KEY / _API_SECRET (see accountConfigFromEnv).

const DDL = Prisma.sql`
  CREATE TABLE IF NOT EXISTS rv_work_orders (
    wo_number            TEXT PRIMARY KEY,
    property_external_id TEXT,
    priority             TEXT,
    synced_at            TIMESTAMPTZ DEFAULT now()
  )`;

async function main() {
  const account = process.argv[2] ?? process.env.RENTVINE_ACCOUNT ?? "pmilighthouse";
  const config = accountConfigFromEnv(account);

  console.log(`Fetching work orders for "${account}" from Rentvine (${config.subdomain}.rentvine.com)…`);
  const wos = await fetchRentvineWorkOrders(config);
  console.log(`Fetched ${wos.length} work orders.`);

  // Safety: never let an upstream hiccup (0 rows) wipe the table.
  if (wos.length === 0) {
    throw new Error("Rentvine returned 0 work orders — aborting to avoid wiping existing data.");
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$executeRaw(DDL);

    const values = Prisma.join(
      wos.map((w) => Prisma.sql`(${w.number}, ${w.propertyExternalId || null}, ${w.priority || null}, now())`)
    );
    const numbers = Prisma.join(wos.map((w) => w.number));

    await prisma.$transaction([
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO rv_work_orders (wo_number, property_external_id, priority, synced_at)
        VALUES ${values}
        ON CONFLICT (wo_number) DO UPDATE
          SET property_external_id = EXCLUDED.property_external_id,
              priority             = EXCLUDED.priority,
              synced_at            = now()`),
      // Drop work orders that no longer exist in Rentvine.
      prisma.$executeRaw(Prisma.sql`DELETE FROM rv_work_orders WHERE wo_number NOT IN (${numbers})`),
    ]);

    console.log(`Synced ${wos.length} Rentvine work orders into rv_work_orders.`);

    // Heartbeat for the admin Data page (never fatal).
    try {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO sync_status (job, last_run_at, detail)
        VALUES ('rentvine_work_orders', now(), ${`${wos.length} work orders`})
        ON CONFLICT (job) DO UPDATE
          SET last_run_at = EXCLUDED.last_run_at, detail = EXCLUDED.detail`);
    } catch (e) {
      console.log(`  [warn] could not write sync_status heartbeat: ${e instanceof Error ? e.message : e}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("\nWork-order sync failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
