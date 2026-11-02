-- Notes on work orders, written in PM-Central (Work Orders list → Notes).
-- Internal coordination; emailed to a chosen PM-Central user only when the
-- writer clicks "Add note & email" (emailed_to / emailed_at record that).
--
-- Not in schema.prisma; the app creates it on first use (ensureNotesTable in
-- src/lib/work-order-notes-db.ts). Additive + idempotent; safe to re-run:
--   npx prisma db execute --file prisma/sql/work_order_notes.sql --schema prisma/schema.prisma
CREATE TABLE IF NOT EXISTS work_order_notes (
    id           SERIAL PRIMARY KEY,
    wo_id        TEXT NOT NULL,          -- work_orders.source_id (LeadSimple process id)
    wo_number    TEXT,                   -- e.g. 100480, for reference
    body         TEXT NOT NULL,
    author_email TEXT,
    author_name  TEXT,
    emailed_to   TEXT,                   -- set only when emailed
    emailed_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_order_notes_wo_idx ON work_order_notes (wo_id, created_at DESC);
