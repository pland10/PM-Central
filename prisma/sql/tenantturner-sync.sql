-- Checkpoint for the Tenant Turner pull sync (src/lib/tenantturner/sync-live.ts):
-- where the next run starts asking for changed applications. Single row.
-- App-owned; the code also creates it on first use.
-- Apply: npx prisma db execute --file prisma/sql/tenantturner-sync.sql --schema prisma/schema.prisma
-- Safe to re-run.
CREATE TABLE IF NOT EXISTS tenantturner_sync_state (
  id          INT PRIMARY KEY DEFAULT 1,
  since       TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenantturner_sync_state_single CHECK (id = 1)
);
