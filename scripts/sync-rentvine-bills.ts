import { PrismaClient, Prisma } from "@prisma/client";
import { fetchRentvineBillLines, accountConfigFromEnv } from "../src/import/sources/rentvine/client";

// Rentvine bill lines → raw `rv_bill_charges`, for the Accounting tab's
// "Billed in Rentvine?" check (src/lib/rv-bill-match.ts): each bank charge is
// matched to a bill line of the same amount, on the tagged property.
//
//   npm run sync:rentvine:bills              # default account (pmilighthouse)
//   npm run sync:rentvine:bills -- <account>
//
// Keeps a rolling window (WINDOW_DAYS) rather than the whole history; the
// table is replaced each run so voided or deleted lines drop out. Runs every
// 2h by day via sync-rentvine-bills.yml (this repo is public, so the runs cost
// no Actions minutes). Logs are public: counts only.

const WINDOW_DAYS = 180;

const DDL = Prisma.sql`
  CREATE TABLE IF NOT EXISTS rv_bill_charges (
    transaction_id       TEXT PRIMARY KEY,
    bill_id              TEXT NOT NULL,
    property_external_id TEXT,
    amount               NUMERIC(12,2) NOT NULL,
    date_posted          DATE NOT NULL,
    description          TEXT,
    payee                TEXT,
    reference            TEXT,
    synced_at            TIMESTAMPTZ DEFAULT now()
  )`;
const INDEX = Prisma.sql`CREATE INDEX IF NOT EXISTS rv_bill_charges_amount_idx ON rv_bill_charges (amount)`;

async function main() {
  const account = process.argv[2] ?? process.env.RENTVINE_ACCOUNT ?? "pmilighthouse";
  const config = accountConfigFromEnv(account);
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

  console.log(`Fetching Rentvine bill lines since ${since} for "${account}"…`);
  const lines = await fetchRentvineBillLines(config, since);
  console.log(`Fetched ${lines.length} bill line(s) across ${new Set(lines.map((l) => l.billId)).size} bill(s).`);

  const prisma = new PrismaClient();
  try {
    await prisma.$executeRaw(DDL);
    await prisma.$executeRaw(INDEX);

    // Safety: an upstream hiccup returning nothing must not wipe the table.
    if (lines.length === 0) {
      const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT count(*) AS n FROM rv_bill_charges`);
      if (Number(n) > 0) throw new Error("Rentvine returned 0 bill lines — keeping the existing data.");
    }

    const ops = [prisma.$executeRaw(Prisma.sql`DELETE FROM rv_bill_charges`)];
    for (let i = 0; i < lines.length; i += 500) {
      const chunk = lines.slice(i, i + 500);
      ops.push(
        prisma.$executeRaw(Prisma.sql`
          INSERT INTO rv_bill_charges
            (transaction_id, bill_id, property_external_id, amount, date_posted, description, payee, reference, synced_at)
          VALUES ${Prisma.join(
            chunk.map(
              (l) => Prisma.sql`(${l.transactionId}, ${l.billId}, ${l.propertyRvId || null}, ${l.amount},
                ${l.date}::date, ${l.description || null}, ${l.payee || null}, ${l.reference || null}, now())`
            )
          )}
          ON CONFLICT (transaction_id) DO NOTHING`)
      );
    }
    await prisma.$transaction(ops);
    console.log(`Synced ${lines.length} bill line(s) into rv_bill_charges.`);

    try {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO sync_status (job, last_run_at, detail)
        VALUES ('rentvine_bill_charges', now(), ${`${lines.length} bill lines since ${since}`})
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
  console.error("\nBill sync failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
