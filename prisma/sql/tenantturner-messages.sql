-- Tenant Turner lead replies (src/lib/tenantturner/messages-db.ts), from its
-- "New message from <lead>" notification emails posted in by a Gmail Apps
-- Script. One row per email, keyed by Gmail message id. App-owned; the code
-- also creates it on first use.
-- Apply: npx prisma db execute --file prisma/sql/tenantturner-messages.sql --schema prisma/schema.prisma
-- Safe to re-run.
CREATE TABLE IF NOT EXISTS tenantturner_messages (
  gmail_id    TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL,
  lead_name   TEXT,
  agent_name  TEXT,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenantturner_messages_received_idx ON tenantturner_messages (received_at DESC);
