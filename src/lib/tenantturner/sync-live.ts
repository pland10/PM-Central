import { Prisma, type PrismaClient } from "@prisma/client";
import { matchPropertyId } from "@/lib/showings";
import { tenantTurnerApi, tenantTurnerConfig } from "@/lib/tenantturner/api";
import type { ShowingInput, TtSyncDeps } from "@/lib/tenantturner/sync";

// Live deps for the Tenant Turner pull sync (./sync.ts): the checkpoint (an
// app-owned raw table, db-change Pattern B; DDL also in
// prisma/sql/tenantturner-sync.sql) and the Showing upsert.

const SOURCE = "tenantturner";
// The user wants showings from the start of November 2026 on; older ones were deleted.
export const TT_DEFAULT_SINCE = "2026-11-01T00:00:00.000Z";

const DDL = `CREATE TABLE IF NOT EXISTS tenantturner_sync_state (
  id          INT PRIMARY KEY DEFAULT 1,
  since       TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenantturner_sync_state_single CHECK (id = 1)
)`;

let ready: Promise<void> | null = null;
function ensureTable(prisma: PrismaClient): Promise<void> {
  if (!ready) {
    ready = prisma
      .$executeRawUnsafe(DDL)
      .then(() => undefined)
      .catch((e) => {
        ready = null;
        throw e;
      });
  }
  return ready;
}

export async function loadTtSince(prisma: PrismaClient): Promise<string | null> {
  await ensureTable(prisma);
  const [row] = await prisma.$queryRaw<{ since: Date }[]>(Prisma.sql`SELECT since FROM tenantturner_sync_state WHERE id = 1`);
  return row ? new Date(row.since).toISOString() : null;
}

export async function saveTtSince(prisma: PrismaClient, iso: string): Promise<void> {
  await ensureTable(prisma);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO tenantturner_sync_state (id, since, last_run_at) VALUES (1, ${iso}::timestamptz, now())
    ON CONFLICT (id) DO UPDATE SET since = EXCLUDED.since, last_run_at = now()`);
}

// Upsert one showing from the API. Tenant Turner's data is authoritative, but a
// field it didn't send is left alone, and a property link is never removed.
export async function upsertTtShowing(prisma: PrismaClient, s: ShowingInput): Promise<{ linked: boolean }> {
  const propertyId = await matchPropertyId(s.ttAddress, s.ttZip, prisma);
  const { externalId, ...fields } = s;
  const data = {
    ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
    ...(propertyId ? { propertyId } : {}),
    lastEventType: "api-sync",
    lastEventAt: new Date(),
  } as Prisma.ShowingUncheckedUpdateInput;
  await prisma.showing.upsert({
    where: { source_externalId: { source: SOURCE, externalId } },
    create: { ...(data as Prisma.ShowingUncheckedCreateInput), source: SOURCE, externalId, status: s.status },
    update: data,
  });
  return { linked: !!propertyId };
}

// Cleanup: drop Tenant Turner showings dated before `date` (YYYY-MM-DD) — the
// showing time, else the first requested time, else when it was booked, else
// when we stored it. Returns how many were deleted.
export async function pruneShowingsBefore(prisma: PrismaClient, date: string): Promise<number> {
  const n = await prisma.$executeRaw(
    Prisma.sql`DELETE FROM "Showing" WHERE source = ${SOURCE} AND COALESCE("startTime", "requestedTime1", "bookedAt", "createdAt") < ${date}::date`
  );
  return Number(n);
}

export function liveTenantTurnerDeps(
  prisma: PrismaClient,
  opts: { sinceOverride?: string; onFields?: TtSyncDeps["onFields"] } = {}
): TtSyncDeps {
  const api = tenantTurnerApi(tenantTurnerConfig());
  return {
    loadSince: () => loadTtSince(prisma),
    saveSince: (iso) => saveTtSince(prisma, iso),
    listProperties: api.listProperties,
    listChangedApplications: api.listChangedApplications,
    getApplication: api.getApplication,
    upsertShowing: (s) => upsertTtShowing(prisma, s),
    defaultSince: TT_DEFAULT_SINCE,
    showingsFrom: TT_DEFAULT_SINCE,
    sinceOverride: opts.sinceOverride,
    onFields: opts.onFields,
  };
}
