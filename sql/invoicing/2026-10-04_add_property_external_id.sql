-- Invoicing DB migration: link an invoice to the property it's about.
--
-- Run this ONCE in the invoicing Supabase project (SQL editor) BEFORE deploying
-- the invoice→property code. The invoicing database is shared by prod and dev,
-- so running it once covers both.
--
-- It is additive and backward-compatible: the column is nullable, so the
-- standalone fallback invoicing app keeps working unchanged. PM-Central stores
-- the PM-Central Property.externalId (the stable, namespaced source id) here.

alter table public.invoices
  add column if not exists property_external_id text;

create index if not exists invoices_property_external_id_idx
  on public.invoices (property_external_id);
