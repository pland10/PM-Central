-- Rentvine work-order details on Neon (Work Orders page enrichment).
--
-- Work orders are managed in LeadSimple (the stage is what the team follows,
-- see work_orders.sql), but Rentvine is the system of record for the work order
-- itself. This table holds the Rentvine-side fields we merge onto each work
-- order by its NUMBER: wo_number here = Rentvine workOrderNumber = LeadSimple
-- work_orders.wo_number.
--
-- Written by scripts/sync-rentvine-work-orders.ts (PM-Central, via the
-- sync-rentvine.yml workflow). Managed with raw SQL (not Prisma) like the other
-- synced mirrors; the sync creates it on first run and this file documents the
-- shape. property_external_id joins to Property.externalId (source 'rentvine')
-- for a clickable property link; cost is intentionally not synced yet (it lives
-- in per-order bills/labor/materials and needs a detail call per work order).

CREATE TABLE IF NOT EXISTS rv_work_orders (
  wo_number            TEXT PRIMARY KEY,   -- Rentvine workOrderNumber (join key)
  property_external_id TEXT,               -- Rentvine propertyID → Property.externalId
  priority             TEXT,               -- Low | Medium | High
  synced_at            TIMESTAMPTZ DEFAULT now()
);
