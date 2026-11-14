import { Prisma, type PrismaClient } from "@prisma/client";
import type { WorkOrderRow } from "@/lib/work-orders";

// Work orders created from PM-Central's "+ New work order", shown on the
// Maintenance list right away instead of waiting for the syncs. Rentvine is
// still the record (the WO is created there first). The list itself comes from
// LeadSimple (work_orders, filled by the leadsimple-search sync — never written
// here), so until LeadSimple has the WO this app-owned table stands in for it.
//
//   - Recorded only once Rentvine returns the WO number (the key LeadSimple
//     and Rentvine share), see /api/work-orders/create.
//   - Its row id is "pmc:<number>", so notes / the tech can be added to it.
//   - When the LeadSimple row arrives (same number), adoptCreatedWorkOrder moves
//     those notes and the tech onto it and drops the stand-in. No sync writes
//     this table, so nothing here is overwritten.
//
// Table: prisma/sql/pm_created_work_orders.sql, also created lazily below
// (db-change skill, Pattern B).

const DDL = `CREATE TABLE IF NOT EXISTS pm_created_work_orders (
  wo_number            TEXT PRIMARY KEY,
  rv_id                TEXT,
  property_external_id TEXT,
  property_label       TEXT,
  unit_id              TEXT,
  priority             TEXT,
  description          TEXT,
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

let ready: Promise<void> | null = null;
function ensureTable(prisma: PrismaClient): Promise<void> {
  if (!ready) {
    ready = prisma
      .$executeRawUnsafe(DDL)
      .then(() => undefined)
      .catch((e) => {
        ready = null; // let a later call retry
        throw e;
      });
  }
  return ready;
}

const PREFIX = "pmc:";
export const pendingWoId = (number: string) => `${PREFIX}${number}`;
export function pendingNumber(id: string): string | null {
  return id.startsWith(PREFIX) && id.length > PREFIX.length ? id.slice(PREFIX.length) : null;
}

export type CreatedWorkOrder = {
  number: string; // Rentvine workOrderNumber (= LeadSimple wo_number)
  rvId: string; // Rentvine workOrderID
  propertyExternalId: string | null; // Property.externalId
  propertyLabel: string;
  unitId: string | null;
  priority: string; // Low | Medium | High
  description: string;
  createdBy: string;
  createdAt: string; // ISO
};

export async function recordCreatedWorkOrder(prisma: PrismaClient, wo: Omit<CreatedWorkOrder, "createdAt">): Promise<void> {
  await ensureTable(prisma);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO pm_created_work_orders
      (wo_number, rv_id, property_external_id, property_label, unit_id, priority, description, created_by)
    VALUES (${wo.number}, ${wo.rvId}, ${wo.propertyExternalId}, ${wo.propertyLabel}, ${wo.unitId},
            ${wo.priority}, ${wo.description}, ${wo.createdBy})
    ON CONFLICT (wo_number) DO NOTHING`);
}

// All stand-ins. Empty when the table isn't there yet (nothing created).
export async function listCreatedWorkOrders(prisma: PrismaClient): Promise<CreatedWorkOrder[]> {
  try {
    const rows = await prisma.$queryRaw<
      {
        wo_number: string;
        rv_id: string | null;
        property_external_id: string | null;
        property_label: string | null;
        unit_id: string | null;
        priority: string | null;
        description: string | null;
        created_by: string | null;
        created_at: Date;
      }[]
    >(Prisma.sql`SELECT wo_number, rv_id, property_external_id, property_label, unit_id, priority, description, created_by, created_at
                 FROM pm_created_work_orders ORDER BY created_at DESC`);
    return rows.map((r) => ({
      number: r.wo_number,
      rvId: r.rv_id ?? "",
      propertyExternalId: r.property_external_id,
      propertyLabel: r.property_label ?? "",
      unitId: r.unit_id,
      priority: r.priority ?? "",
      description: r.description ?? "",
      createdBy: r.created_by ?? "",
      createdAt: new Date(r.created_at).toISOString(),
    }));
  } catch {
    return [];
  }
}

// Pure: which stand-ins LeadSimple still doesn't have, and which have arrived
// (paired with the LeadSimple row id). `lsByNumber`: wo_number → source_id.
export function splitCreated(
  created: CreatedWorkOrder[],
  lsByNumber: Map<string, string>
): { pending: CreatedWorkOrder[]; arrived: { number: string; lsId: string }[] } {
  const pending: CreatedWorkOrder[] = [];
  const arrived: { number: string; lsId: string }[] = [];
  for (const c of created) {
    const lsId = lsByNumber.get(c.number);
    if (lsId) arrived.push({ number: c.number, lsId });
    else pending.push(c);
  }
  return { pending, arrived };
}

const ISSUE_MAX = 140;

// Pure: a stand-in as a Maintenance row. It starts in LeadSimple's first stage
// ("New WO"), as the real row will. Rentvine's priority wins once the Rentvine
// work-order sync has it.
export function createdToRow(c: CreatedWorkOrder, enrich: { propertyId: string | null; priority?: string }): WorkOrderRow {
  const firstLine = c.description.split("\n")[0].trim() || "Work order";
  return {
    id: pendingWoId(c.number),
    number: c.number,
    issue: firstLine.length > ISSUE_MAX ? `${firstLine.slice(0, ISSUE_MAX - 1)}…` : firstLine,
    stage: "New WO",
    terminal: false,
    property: c.propertyLabel || "—",
    vendor: "",
    assignee: "",
    link: "",
    priority: enrich.priority || c.priority,
    propertyId: enrich.propertyId,
    lastUpdate: "",
    lastUpdateAt: null,
    createdAt: c.createdAt,
    updatedAt: c.createdAt,
    closedAt: null,
    dueAt: null,
    rvStatus: "",
    preventive: false,
    pending: true,
  };
}

// LeadSimple now has the work order: move what was added to the stand-in (notes,
// the tech) onto the LeadSimple row, then drop the stand-in — one transaction,
// and safe to run twice. A tech already set on the LeadSimple row is kept.
export async function adoptCreatedWorkOrder(prisma: PrismaClient, number: string, lsId: string): Promise<void> {
  const from = pendingWoId(number);
  const [t] = await prisma.$queryRaw<{ notes: boolean; techs: boolean }[]>(Prisma.sql`
    SELECT to_regclass('public.work_order_notes') IS NOT NULL AS notes,
           to_regclass('public.work_order_techs') IS NOT NULL AS techs`);
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (t?.notes) {
    ops.push(prisma.$executeRaw(Prisma.sql`UPDATE work_order_notes SET wo_id = ${lsId} WHERE wo_id = ${from}`));
  }
  if (t?.techs) {
    ops.push(
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO work_order_techs (wo_id, tech_email, tech_name, assigned_by, assigned_at)
        SELECT ${lsId}, tech_email, tech_name, assigned_by, assigned_at FROM work_order_techs WHERE wo_id = ${from}
        ON CONFLICT (wo_id) DO NOTHING`),
      prisma.$executeRaw(Prisma.sql`DELETE FROM work_order_techs WHERE wo_id = ${from}`)
    );
  }
  ops.push(prisma.$executeRaw(Prisma.sql`DELETE FROM pm_created_work_orders WHERE wo_number = ${number}`));
  await prisma.$transaction(ops);
}

// The work-order id a note / tech should be saved under, or null if there's no
// such work order. A stand-in id resolves to the LeadSimple row once that has
// arrived (adopting the stand-in first, so nothing is split across the two).
export async function resolveWorkOrderId(prisma: PrismaClient, id: string): Promise<string | null> {
  const number = pendingNumber(id);
  if (number === null) {
    const [found] = await prisma.$queryRaw<{ n: number }[]>(
      Prisma.sql`SELECT COUNT(*)::int AS n FROM work_orders WHERE source_id = ${id}`
    );
    return found?.n ? id : null;
  }
  const [ls] = await prisma.$queryRaw<{ source_id: string }[]>(
    Prisma.sql`SELECT source_id FROM work_orders WHERE wo_number = ${number} LIMIT 1`
  );
  if (ls?.source_id) {
    await adoptCreatedWorkOrder(prisma, number, ls.source_id);
    return ls.source_id;
  }
  try {
    const [p] = await prisma.$queryRaw<{ n: number }[]>(
      Prisma.sql`SELECT COUNT(*)::int AS n FROM pm_created_work_orders WHERE wo_number = ${number}`
    );
    return p?.n ? id : null;
  } catch {
    return null; // table not created yet — no stand-ins
  }
}
