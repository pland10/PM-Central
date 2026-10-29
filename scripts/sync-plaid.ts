import { PrismaClient, Prisma } from "@prisma/client";
import { isPlaidConfigured } from "../src/lib/plaid";
import { ensurePlaidTables, syncOneItem } from "../src/lib/plaid-sync";

// Daily Plaid transaction sync. For each linked account in plaid_items, pulls
// new/updated/removed transactions via /transactions/sync (incremental, by
// cursor) and upserts them into plaid_transactions, then saves the new cursor:
//
//   npm run sync:plaid
//
// Sync-owned raw tables (see prisma/sql/plaid.sql), managed with raw SQL like
// rv_work_orders. Idempotent: keyed on Plaid's transaction_id, cursor-based, so
// re-runs never duplicate. No-ops cleanly when no accounts are linked yet. The
// per-item sync is shared with the Connect flow (src/lib/plaid-sync.ts).
//
// Creds: PLAID_CLIENT_ID / PLAID_SECRET / PLAID_ENV + DATABASE_URL.

type ItemRow = { item_id: string; access_token: string; cursor: string | null };

async function main() {
  if (!isPlaidConfigured()) {
    console.log("Plaid not configured (PLAID_CLIENT_ID / PLAID_SECRET) — skipping.");
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error("[ERROR] DATABASE_URL not set.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    await ensurePlaidTables(prisma);

    const items = await prisma.$queryRaw<ItemRow[]>(
      Prisma.sql`SELECT item_id, access_token, cursor FROM plaid_items WHERE status = 'active'`
    );
    console.log(`${items.length} linked account(s) to sync.`);

    let upserted = 0;
    let removed = 0;
    for (const item of items) {
      const r = await syncOneItem(prisma, {
        itemId: item.item_id,
        accessToken: item.access_token,
        cursor: item.cursor,
      });
      upserted += r.upserted;
      removed += r.removed;
    }

    console.log(`Synced ${upserted} transaction(s), removed ${removed}, across ${items.length} account(s).`);

    try {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO sync_status (job, last_run_at, detail)
        VALUES ('plaid_transactions', now(), ${`${upserted} upserted, ${items.length} account(s)`})
        ON CONFLICT (job) DO UPDATE SET last_run_at = EXCLUDED.last_run_at, detail = EXCLUDED.detail`);
    } catch (e) {
      console.log(`  [warn] could not write sync_status heartbeat: ${e instanceof Error ? e.message : e}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("\nPlaid sync failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
