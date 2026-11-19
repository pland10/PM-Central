-- Monday tactical meeting tables (see src/lib/meetings-db.ts).
--
-- Applied with `prisma db execute` (see DEPLOY.md), NOT `prisma db push`:
-- this database also holds tables that aren't modeled in schema.prisma
-- (activities, payments, work_orders, rv_work_orders, sync_status — written by
-- the leadsimple-search sync), and `db push` would try to DROP them.
--
-- These tables are app-owned (not Prisma models) and are also created on first
-- use by ensureMeetingTables(); this file is the explicit, idempotent DDL and is
-- safe to run more than once, on both the dev and prod Neon branches.

-- One free-text note per house per meeting date (the dated history).
CREATE TABLE IF NOT EXISTS meeting_notes (
    property_id  TEXT NOT NULL,
    meeting_date DATE NOT NULL,
    body         TEXT NOT NULL DEFAULT '',
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (property_id, meeting_date)
);

-- Houses taken off the sheet (hidden from the meeting, never deleted).
CREATE TABLE IF NOT EXISTS meeting_removed_properties (
    property_id TEXT PRIMARY KEY,
    removed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The admin's custom walk-through sequence for the tactical sheet (lower = first).
CREATE TABLE IF NOT EXISTS property_meeting_order (
    property_id TEXT PRIMARY KEY,
    sort_order  INT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
