-- Work orders created from PM-Central's "+ New work order", shown on the
-- Maintenance list right away until LeadSimple's copy arrives.
--
-- App-owned (NOT in schema.prisma), additive + idempotent like the other raw
-- tables. The work order is created in Rentvine first; a row is kept here only
-- once Rentvine returns its work-order number, which is the key the LeadSimple
-- row (work_orders.wo_number) arrives under. Notes / the tech added meanwhile
-- are stored under "pmc:<wo_number>" and moved onto the LeadSimple row (then
-- this row is deleted) by adoptCreatedWorkOrder in src/lib/created-work-orders.ts.
-- No sync writes this table.
--
-- Also created in code by that module (db-change skill, Pattern B); this file is
-- the canonical definition. Apply with:
--   npx prisma db execute --file prisma/sql/pm_created_work_orders.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS pm_created_work_orders (
    wo_number            TEXT PRIMARY KEY,            -- Rentvine workOrderNumber (= LeadSimple wo_number)
    rv_id                TEXT,                        -- Rentvine workOrderID
    property_external_id TEXT,                        -- Property.externalId
    property_label       TEXT,                        -- address, for display until LeadSimple has it
    unit_id              TEXT,                        -- Rentvine unitID, if a unit was picked
    priority             TEXT,                        -- Low | Medium | High (as created)
    description          TEXT,
    created_by           TEXT,                        -- email
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
