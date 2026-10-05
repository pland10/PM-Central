# Migrate inspections into the single PM-Central database (Neon)

Inspection **data** moves from the inspections Supabase project into the main
Neon database. Photo **files** stay in the Supabase Storage bucket, and
**inspectors** stay as Supabase Auth users — only the relational tables move.

Only the **library/reference** data is copied (properties, reasons, services,
special instructions, and their house assignments). **Visit records**
(inspections, checklist items, work items, photos) are disposable and start
fresh in Neon.

Run once per Neon branch (dev first, then prod).

## Steps

1. **Create the tables** on the target branch:
   ```bash
   # DATABASE_URL = target Neon branch (dev or prod)
   npm run db:push
   ```

2. **Copy the reference data** from Supabase:
   ```bash
   # set all three in the shell:
   #   DATABASE_URL             = target Neon branch
   #   NEXT_PUBLIC_SUPABASE_URL = inspections Supabase project URL
   #   SUPABASE_SERVICE_KEY     = its service_role (secret) key
   npm run migrate:inspections
   ```
   Idempotent (upserts by id, rebuilds assignment links, resets sequences).

3. **Verify** on the matching site: open Inspections → Settings, confirm the
   special instructions + their house counts match, and that the New Inspection
   form lists the right properties/reasons/services.

4. Repeat 1–3 with `DATABASE_URL` pointed at the **prod** branch.

## Notes
- `SUPABASE_SERVICE_KEY` / `NEXT_PUBLIC_SUPABASE_URL` stay set in the running
  app — still used for photo storage and inspector auth.
- Existing inspection visits/photos are not migrated (disposable). New ones are
  created directly in Neon (photos upload to the same Supabase bucket).
