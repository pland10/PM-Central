-- Rent-reminder emails from the Delinquencies dashboard panel.
--   reminder_template : the single admin-editable email (subject + body).
--   reminder_log      : one row per reminder sent, for "Reminded <date>" hints.
-- Not in schema.prisma; the app creates these on first use (ensureRemindersTables
-- in src/lib/reminders-db.ts). Additive + idempotent; safe to re-run:
--   npx prisma db execute --file prisma/sql/reminders.sql --schema prisma/schema.prisma
CREATE TABLE IF NOT EXISTS reminder_template (
    id          INT PRIMARY KEY DEFAULT 1,
    subject     TEXT NOT NULL,
    body        TEXT NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT now(),
    updated_by  TEXT,
    CONSTRAINT reminder_template_single CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS reminder_log (
    id         SERIAL PRIMARY KEY,
    lease_id   TEXT NOT NULL,          -- Lease.id (cuid) the reminder was about
    tenant     TEXT,
    email      TEXT,
    amount     NUMERIC,                -- balance at the time it was sent
    sent_by    TEXT,                   -- the logged-in user who sent it
    sent_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reminder_log_lease_idx ON reminder_log (lease_id, sent_at DESC);
