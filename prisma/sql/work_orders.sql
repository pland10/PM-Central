-- Work orders table on Neon (dashboard: work orders by stage).
--
-- One row per LeadSimple "Work Orders" process item, written by
-- work_order_sync.py in pland10/leadsimple-search. Work orders live in
-- LeadSimple (not Rentvine): they're process items whose *stage* is the status
-- the dashboard groups by. Managed with raw SQL (not Prisma) to match the other
-- synced tables (payments, activities); nothing in schema.prisma references it.
-- The sync creates this table on first run; this file documents the shape.

CREATE TABLE IF NOT EXISTS work_orders (
  source_id        TEXT PRIMARY KEY,   -- LeadSimple process id
  wo_number        TEXT,               -- e.g. 100437
  title            TEXT,               -- job description
  name             TEXT,               -- full LeadSimple name
  stage            TEXT,               -- e.g. "New WO" (the status we group by)
  stage_status     TEXT,               -- LeadSimple stage status (working/complete/…)
  property_address TEXT,
  vendor_name      TEXT,
  assignee_name    TEXT,
  link             TEXT,
  created_at       TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ,
  closed_at        TIMESTAMPTZ,
  synced_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS work_orders_stage_idx ON work_orders(stage);
