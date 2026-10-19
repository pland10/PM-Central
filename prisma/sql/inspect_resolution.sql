-- Inspection owner message / draft + "needs attention" resolution.
--
-- Applied with `prisma db execute` (see DEPLOY.md), NOT `prisma db push`.
-- Idempotent: ADD COLUMN IF NOT EXISTS keeps this safe to run more than once,
-- on both the dev and prod Neon branches. These columns are read/written with
-- raw SQL (see src/lib/inspections/db.ts), so they are intentionally NOT in the
-- Prisma model — a not-yet-migrated database keeps working until this runs.

-- The owner-directed message + the saved photo selection (a draft that can be
-- saved without sending). summary_photo_ids is a JSON array of photo ids.
ALTER TABLE pmi_inspect_inspections ADD COLUMN IF NOT EXISTS owner_message TEXT;
ALTER TABLE pmi_inspect_inspections ADD COLUMN IF NOT EXISTS summary_photo_ids JSONB;

-- Resolution of a "Needs attention" inspection: either marked resolved, or a
-- Rentvine work order was created for it. resolution_status is one of
-- '' | 'resolved' | 'work_order'.
ALTER TABLE pmi_inspect_inspections ADD COLUMN IF NOT EXISTS resolution_status TEXT;
ALTER TABLE pmi_inspect_inspections ADD COLUMN IF NOT EXISTS resolution_note TEXT;
ALTER TABLE pmi_inspect_inspections ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE pmi_inspect_inspections ADD COLUMN IF NOT EXISTS resolved_by_user_id TEXT;

-- When resolved via a work order: the Rentvine work-order number/id created, so
-- we can show + deep-link it. work_order_created_at is when we created it.
ALTER TABLE pmi_inspect_inspections ADD COLUMN IF NOT EXISTS work_order_ref TEXT;
ALTER TABLE pmi_inspect_inspections ADD COLUMN IF NOT EXISTS work_order_created_at TIMESTAMPTZ;
