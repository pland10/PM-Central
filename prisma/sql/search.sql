-- Full-text Search tables on Neon (Phase 3: single DB).
--
-- These two tables hold the synced LeadSimple/Rentvine "activities" feed that
-- powers Search, plus the sync heartbeat. They are managed with raw SQL rather
-- than Prisma because Prisma can't model a tsvector column, a GIN index, or the
-- update trigger. Nothing in schema.prisma references them, so `prisma db push`
-- leaves them untouched.
--
-- Apply with:  psql "$DATABASE_URL" -f prisma/sql/search.sql   (idempotent)
-- The LeadSimple sync (pland10/leadsimple-search) writes rows here; PM-Central's
-- /api/search/* routes read them.

CREATE TABLE IF NOT EXISTS activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       TEXT UNIQUE NOT NULL,
  type            TEXT NOT NULL,        -- email, text, call, note, chat, task, payment
  content         TEXT,                 -- full body / description
  subject         TEXT,                 -- email subject or task kind
  direction       TEXT,                 -- inbound, outbound
  outcome         TEXT,                 -- call outcome
  duration        INTEGER,              -- call duration in seconds
  deal_id         TEXT,
  deal_name       TEXT,
  pipeline_name   TEXT,
  contact_names   TEXT,
  contact_emails  TEXT,
  contact_phones  TEXT,
  assignee_name   TEXT,
  property_address TEXT,
  ls_link         TEXT,                 -- direct link back to the source record
  due_at          TIMESTAMPTZ,          -- tasks only
  completed_at    TIMESTAMPTZ,          -- tasks only
  created_at      TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ DEFAULT NOW(),
  search_vector   TSVECTOR
);

CREATE INDEX IF NOT EXISTS activities_search_idx  ON activities USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS activities_type_idx    ON activities(type);
CREATE INDEX IF NOT EXISTS activities_created_idx ON activities(created_at DESC);
CREATE INDEX IF NOT EXISTS activities_deal_idx    ON activities(deal_name);

-- Keep the search vector in sync on every write. Weighted so names/subjects
-- (A) rank above body/address (B) above emails/assignee (C).
CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS TRIGGER
SET search_path = ''
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.deal_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.contact_names, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.subject, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.property_address, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.assignee_name, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.contact_emails, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS activities_search_trigger ON activities;
CREATE TRIGGER activities_search_trigger
  BEFORE INSERT OR UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION update_search_vector();

-- Sync heartbeat: one row per job (tasks, activity_refresh, settlements, chat,
-- and the private cursor rows prefixed with "_"). PM-Central reads the oldest
-- last_run_at for the "Updated N ago" indicator and looks for "stuck" in detail.
CREATE TABLE IF NOT EXISTS sync_status (
  job          TEXT PRIMARY KEY,
  last_run_at  TIMESTAMPTZ,
  detail       TEXT
);
