-- Pre-screening details on Showing, from the Tenant Turner API pull
-- (src/lib/tenantturner/sync.ts): the lead's inquiry comment, qualified
-- yes/no, their pre-screen answers ([{question, answer}]) and the showing's
-- message. Mirrors the Showing model in schema.prisma.
-- Apply BEFORE deploying the code that reads them (the "Apply SQL file"
-- workflow, or: npx prisma db execute --file prisma/sql/showings-prescreen.sql --schema prisma/schema.prisma).
-- Additive and idempotent: safe to re-run.
ALTER TABLE "Showing" ADD COLUMN IF NOT EXISTS "leadComments" TEXT;
ALTER TABLE "Showing" ADD COLUMN IF NOT EXISTS "leadQualified" BOOLEAN;
ALTER TABLE "Showing" ADD COLUMN IF NOT EXISTS "leadQuestions" JSONB;
ALTER TABLE "Showing" ADD COLUMN IF NOT EXISTS "showingMessage" TEXT;
