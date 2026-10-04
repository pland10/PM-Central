# Migrate invoicing into the single PM-Central database (Neon)

Invoicing used to live in a separate Supabase project. It now lives in the main
PM-Central Postgres (Neon), so it shares the app's dev/prod branch isolation.

This runbook moves the existing invoice data over. Run it **once per Neon
branch** (dev first, then prod). It's additive and idempotent.

## Prerequisites
- The invoicing code changes are deployed/checked out (new Prisma `Invoice` /
  `InvoiceSetting` models).
- You have the OLD invoicing Supabase project's URL + `service_role` key.

## Steps (do dev first, verify, then prod)

1. **Create the invoice tables** on the target Neon branch:
   ```bash
   # DATABASE_URL = the target branch (dev or prod)
   npm run db:push
   ```
   This only ADDS the `Invoice` / `InvoiceSetting` tables — existing data is
   untouched.

2. **Copy the invoice data** from the old Supabase project:
   ```bash
   # In the same shell, set all three:
   #   DATABASE_URL                   = target Neon branch
   #   INVOICING_SUPABASE_URL         = old invoicing Supabase project URL
   #   INVOICING_SUPABASE_SERVICE_KEY = its service_role key
   npm run migrate:invoices
   ```
   Idempotent (upserts by id) — safe to re-run.

3. **Verify** on the matching site (dev site for the dev branch): open
   Invoicing, confirm counts/totals match, open and print one invoice.

4. Repeat 1–3 with `DATABASE_URL` pointed at the **prod** branch.

## After cutover
- PM-Central no longer reads the old invoicing Supabase project.
- The **standalone invoicing app still writes to that old project** — so it is
  now disconnected from PM-Central. Either retire it, or repoint it, or new
  invoices it creates won't appear in PM-Central.
- Clear `INVOICING_SUPABASE_URL` / `INVOICING_SUPABASE_SERVICE_KEY` from the
  running environments once migrated (they're only needed for this script).
