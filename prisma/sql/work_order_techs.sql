-- The in-house tech assigned to a work order (e.g. Ari), set on the Maintenance
-- screen. Separate from the LeadSimple assignee (who manages the work order).
-- One per work order; only PM-Central users can be picked.
--
-- Not in schema.prisma; the app creates it on first use (work-order-tech-db.ts).
-- Additive + idempotent; safe to re-run:
--   npx prisma db execute --file prisma/sql/work_order_techs.sql --schema prisma/schema.prisma
CREATE TABLE IF NOT EXISTS work_order_techs (
    wo_id       TEXT PRIMARY KEY,         -- work_orders.source_id (LeadSimple process id)
    tech_email  TEXT NOT NULL,
    tech_name   TEXT NOT NULL,
    assigned_by TEXT,                     -- email of who assigned it
    assigned_at TIMESTAMPTZ DEFAULT now()
);
