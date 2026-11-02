-- Recurring billing + Squatter Watch receipts, moved from the standalone
-- invoicing app (pland10/pmi-invoicing) into PM-Central:
--   "InvoiceCustomer"  — who is billed, service, rate, frequency, start month
--   "InspectorReceipt" — payments out to Squatter Watch inspectors
--   "WatchedProperty"  — addresses in the Squatter Watch programme
-- plus the "one invoice per customer per billing period" guard on "Invoice".
--
-- Applied with `prisma db execute` (or the "Apply SQL file" workflow), NOT
-- `prisma db push`: this database also holds tables not modeled in
-- schema.prisma, which `db push` would try to DROP. Mirrors the Prisma models
-- exactly. Idempotent: safe to re-run, on dev and prod.

CREATE TABLE IF NOT EXISTS "InvoiceCustomer" (
    "id" TEXT NOT NULL,
    "billingParty" TEXT NOT NULL DEFAULT 'pmi',
    "name" TEXT NOT NULL,
    "addr" TEXT,
    "contact" TEXT,
    "attn" TEXT,
    "service" TEXT,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "startDate" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rentvinePortfolioId" TEXT,
    "rentvineContactId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceCustomer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InvoiceCustomer_isActive_name_idx" ON "InvoiceCustomer"("isActive", "name");

CREATE TABLE IF NOT EXISTS "InspectorReceipt" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "billingParty" TEXT NOT NULL DEFAULT 'pmi',
    "inspector" TEXT NOT NULL DEFAULT '',
    "paidOn" TEXT NOT NULL,
    "method" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "items" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectorReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InspectorReceipt_number_key" ON "InspectorReceipt"("number");
CREATE INDEX IF NOT EXISTS "InspectorReceipt_paidOn_idx" ON "InspectorReceipt"("paidOn");
CREATE INDEX IF NOT EXISTS "InspectorReceipt_inspector_idx" ON "InspectorReceipt"("inspector");

CREATE TABLE IF NOT EXISTS "WatchedProperty" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "label" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "rentvinePropertyId" TEXT,
    "rentvinePortfolioId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchedProperty_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WatchedProperty_rentvinePropertyId_key" ON "WatchedProperty"("rentvinePropertyId");
CREATE UNIQUE INDEX IF NOT EXISTS "WatchedProperty_rentvinePortfolioId_key" ON "WatchedProperty"("rentvinePortfolioId");
CREATE INDEX IF NOT EXISTS "WatchedProperty_isActive_address_idx" ON "WatchedProperty"("isActive", "address");

-- One live invoice per customer per billing period (the old app's
-- invoices_customer_period_uniq). Not in schema.prisma (Prisma can't express a
-- partial unique index); the API also checks before creating. Guarded so a
-- pre-existing duplicate reports a notice instead of failing the whole file.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_customer_period_live_key"
    ON "Invoice"("customerId", "periodKey")
    WHERE "customerId" IS NOT NULL AND "periodKey" IS NOT NULL AND "deletedAt" IS NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Invoice_customer_period_live_key not created: duplicate customer/period invoices exist';
END $$;
