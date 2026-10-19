-- Move-in inspection support.
--
-- Applied with `prisma db execute` (see DEPLOY.md), NOT `prisma db push`.
-- Idempotent. These columns are read/written with raw SQL (see
-- src/lib/inspections/db.ts) and are intentionally NOT in the Prisma model, so
-- a not-yet-migrated database keeps working until this runs.

-- Inspection type: null/'routine' for the standard inspection, 'move_in' for a
-- move-in condition survey (checklist seeded from the move-in template).
ALTER TABLE pmi_inspect_inspections ADD COLUMN IF NOT EXISTS inspection_type TEXT;

-- Move-in header + typed signatures (tenant names, move-in date, signature
-- name/date for tenant and PM). The room-by-room answers live in the existing
-- checklist table.
ALTER TABLE pmi_inspect_inspections ADD COLUMN IF NOT EXISTS meta JSONB;
