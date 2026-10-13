-- Showing table (Tenant Turner showings).
--
-- Applied with `prisma db execute` (see DEPLOY.md), NOT `prisma db push`:
-- this database also holds tables that aren't modeled in schema.prisma
-- (activities, payments, work_orders, rv_work_orders, sync_status — written by
-- the leadsimple-search sync), and `db push` would try to DROP them. This file
-- mirrors the Prisma `Showing` model exactly so the generated client works.
--
-- Idempotent: safe to run more than once, and on both the dev and prod Neon
-- branches.

CREATE TABLE IF NOT EXISTS "Showing" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'tenantturner',
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "viewingType" TEXT,
    "startTime" TIMESTAMP(3),
    "requestedTime1" TIMESTAMP(3),
    "requestedTime2" TIMESTAMP(3),
    "requestedTime3" TIMESTAMP(3),
    "leadSubmittedAt" TIMESTAMP(3),
    "bookedAt" TIMESTAMP(3),
    "leadName" TEXT,
    "leadEmail" TEXT,
    "leadPhone" TEXT,
    "moveIn" TEXT,
    "acquisitionSource" TEXT,
    "agentName" TEXT,
    "agentEmail" TEXT,
    "agentPhone" TEXT,
    "feedbackRating" INTEGER,
    "feedbackComments" TEXT,
    "lockboxCodeSentAt" TIMESTAMP(3),
    "ttPropertyId" TEXT,
    "ttAddress" TEXT,
    "ttCity" TEXT,
    "ttState" TEXT,
    "ttZip" TEXT,
    "propertyId" TEXT,
    "lastEventType" TEXT,
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Showing_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Showing_propertyId_idx" ON "Showing"("propertyId");
CREATE INDEX IF NOT EXISTS "Showing_startTime_idx" ON "Showing"("startTime");
CREATE INDEX IF NOT EXISTS "Showing_status_idx" ON "Showing"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "Showing_source_externalId_key" ON "Showing"("source", "externalId");

-- Foreign key to Property (nullable; a showing keeps its address snapshot even
-- when unlinked). Guarded so re-running doesn't error.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Showing_propertyId_fkey'
  ) THEN
    ALTER TABLE "Showing" ADD CONSTRAINT "Showing_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Columns added after the table first shipped. ADD COLUMN IF NOT EXISTS keeps
-- this idempotent on tables created before these existed.
ALTER TABLE "Showing" ADD COLUMN IF NOT EXISTS "leadSubmittedAt" TIMESTAMP(3);
ALTER TABLE "Showing" ADD COLUMN IF NOT EXISTS "bookedAt" TIMESTAMP(3);
