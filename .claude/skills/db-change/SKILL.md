---
name: db-change
description: Use whenever a change needs a new table, column, or index in the database, or touches prisma/schema.prisma or prisma/sql. Shared Neon DB — prevents `prisma db push` from dropping tables owned by the leadsimple-search sync.
---

# Changing the database safely

The prod and dev Neon databases also hold tables **not in `schema.prisma`**
(`activities`, `payments`, `work_orders`, `rv_work_orders`, `sync_status`,
`rc_*` — written by `pland10/leadsimple-search`). **`prisma db push` /
`prisma migrate` would DROP them.** Never run either against dev or prod.

## Pick the pattern

**A. New Prisma-modeled table or column** (the app reads/writes it via the client)
1. Edit `prisma/schema.prisma`.
2. Write `prisma/sql/<feature>.sql` that mirrors the model **exactly**, idempotent:
   `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`,
   `CREATE INDEX IF NOT EXISTS`. Header comment: what it is, applied with
   `db execute`, safe to re-run. Template: `prisma/sql/showings.sql`.
3. Apply to **dev first**, then prod:
   `npx prisma db execute --file prisma/sql/<feature>.sql --schema prisma/schema.prisma`
   (with `DATABASE_URL` pointing at that branch). The user usually runs this —
   this sandbox has no DB credentials. Hand them the exact command.
4. `npx prisma generate` locally so the types compile.

**B. Extra column on a table the sync owns, or one kept out of the Prisma model**
Use a lazy ensure-guard in code, run once per process before first use:
```ts
let xColumn: Promise<void> | null = null;
function ensureXColumn(): Promise<void> {
  if (!xColumn) {
    xColumn = prisma
      .$executeRawUnsafe(`ALTER TABLE <t> ADD COLUMN IF NOT EXISTS <c> <type>`)
      .then(() => undefined)
      .catch((e) => {
        xColumn = null; // let a later call retry
        throw e;
      });
  }
  return xColumn;
}
```
Existing examples: `ensureAttachmentsColumn` (`src/lib/search-db.ts`),
`ensureInspectionExtraColumns` (`src/lib/inspections/db.ts`),
`ensureCaptureTables` (`src/lib/team-comms-db.ts`). Also add the DDL to a
`prisma/sql/*.sql` file so it's documented and can be pre-applied.

## Rules
- Additive only. Renames/drops need a written plan and the user's explicit OK.
- Status/role fields stay `String` (not Prisma enums); list allowed values in a
  `schema.prisma` comment.
- Imports **upsert on `(source, externalId)`** — add a unique index on that
  pair for any new synced model.
- Raw SQL against sync-owned tables: parameterize with `Prisma.sql` tagged
  templates; never interpolate user input into `$executeRawUnsafe`.
- Postgres error `57P01` ("terminating connection due to administrator
  command") is Neon autosuspend dropping a pooled connection — transient, not a
  schema problem.

## Tests
Cover the code path that reads the new column with a test that mocks Prisma
(see the `tdd` skill) — including the "column/table missing" fallback the page
should degrade to.
