-- Rentvine's real units (id + name per property), mirrored by the daily core
-- sync (scripts/sync-rentvine.ts → saveRentvineUnits in src/lib/rentvine-units.ts)
-- from GET /properties/units. Used by the Accounting → Transactions property
-- picker so a multi-unit building can be charged to a specific unit.
--
-- Not in schema.prisma (the Prisma Unit rows are placeholders built from active
-- leases). The sync creates it; this file documents it. Additive + idempotent:
--   npx prisma db execute --file prisma/sql/rentvine_units.sql --schema prisma/schema.prisma
CREATE TABLE IF NOT EXISTS rentvine_units (
    unit_id              TEXT PRIMARY KEY,           -- Rentvine unitID
    property_external_id TEXT NOT NULL,              -- Rentvine propertyID = properties."externalId"
    name                 TEXT NOT NULL DEFAULT '',   -- e.g. "Unit 1", "2F"
    is_active            BOOLEAN NOT NULL DEFAULT true,
    synced_at            TIMESTAMPTZ DEFAULT now()
);
