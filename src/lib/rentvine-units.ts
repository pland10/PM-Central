import { Prisma, type PrismaClient } from "@prisma/client";
import type { RvUnitLive } from "@/import/sources/rentvine/client";

// Rentvine's real units (id + name per property), mirrored into a raw
// `rentvine_units` table by the daily core sync (scripts/sync-rentvine.ts).
// Used by the Transactions property picker so a multi-unit building can be
// charged to a specific unit. Not in schema.prisma — the Prisma Unit rows are
// placeholders built from active leases. Documented in
// prisma/sql/rentvine_units.sql.

const DDL = `CREATE TABLE IF NOT EXISTS rentvine_units (
  unit_id              TEXT PRIMARY KEY,
  property_external_id TEXT NOT NULL,
  name                 TEXT NOT NULL DEFAULT '',
  is_active            BOOLEAN NOT NULL DEFAULT true,
  synced_at            TIMESTAMPTZ DEFAULT now()
)`;

// Upsert every unit and drop ones Rentvine no longer returns. An empty fetch
// is treated as an upstream hiccup and changes nothing.
export async function saveRentvineUnits(prisma: PrismaClient, units: RvUnitLive[]): Promise<number> {
  if (units.length === 0) return 0;
  await prisma.$executeRawUnsafe(DDL);
  const values = Prisma.join(
    units.map((u) => Prisma.sql`(${u.unitId}, ${u.propertyExternalId}, ${u.name}, ${u.active}, now())`)
  );
  const ids = Prisma.join(units.map((u) => u.unitId));
  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`
      INSERT INTO rentvine_units (unit_id, property_external_id, name, is_active, synced_at)
      VALUES ${values}
      ON CONFLICT (unit_id) DO UPDATE
        SET property_external_id = EXCLUDED.property_external_id,
            name                 = EXCLUDED.name,
            is_active            = EXCLUDED.is_active,
            synced_at            = now()`),
    prisma.$executeRaw(Prisma.sql`DELETE FROM rentvine_units WHERE unit_id NOT IN (${ids})`),
  ]);
  return units.length;
}

export type UnitOption = { unitId: string; propertyExternalId: string; name: string };

// Active units, for the property picker. Empty if the table isn't there yet
// (before the first sync with units).
export async function listActiveUnits(prisma: PrismaClient): Promise<UnitOption[]> {
  try {
    const rows = await prisma.$queryRaw<{ unit_id: string; property_external_id: string; name: string }[]>(Prisma.sql`
      SELECT unit_id, property_external_id, name FROM rentvine_units
      WHERE is_active ORDER BY property_external_id, name`);
    return rows.map((r) => ({ unitId: r.unit_id, propertyExternalId: r.property_external_id, name: r.name }));
  } catch {
    return [];
  }
}

// Does this unit belong to this property?
export async function unitBelongsToProperty(prisma: PrismaClient, unitId: string, propertyId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ n: number }[]>(
    Prisma.sql`SELECT COUNT(*)::int AS n FROM rentvine_units WHERE unit_id = ${unitId} AND property_external_id = ${propertyId}`
  );
  return (rows[0]?.n ?? 0) > 0;
}
