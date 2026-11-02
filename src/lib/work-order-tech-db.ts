import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StaffMember } from "@/lib/work-order-notes";

// The in-house tech doing a work order (e.g. Ari) — separate from the LeadSimple
// assignee who manages it. Set from the Maintenance screen; stored only in
// PM-Central (prisma/sql/work_order_techs.sql), created on first use. One tech
// per work order, keyed by the LeadSimple process id.

const DDL = `CREATE TABLE IF NOT EXISTS work_order_techs (
  wo_id       TEXT PRIMARY KEY,
  tech_email  TEXT NOT NULL,
  tech_name   TEXT NOT NULL,
  assigned_by TEXT,
  assigned_at TIMESTAMPTZ DEFAULT now()
)`;

let table: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!table) {
    table = prisma
      .$executeRawUnsafe(DDL)
      .then(() => undefined)
      .catch((e) => {
        table = null; // let a later call retry
        throw e;
      });
  }
  return table;
}

// Tech per work order id. Empty if the table isn't there yet.
export async function techAssignments(): Promise<Record<string, StaffMember>> {
  try {
    await ensureTable();
    const rows = await prisma.$queryRaw<{ wo_id: string; tech_email: string; tech_name: string }[]>(
      Prisma.sql`SELECT wo_id, tech_email, tech_name FROM work_order_techs`
    );
    return Object.fromEntries(rows.map((r) => [r.wo_id, { email: r.tech_email, name: r.tech_name }]));
  } catch {
    return {};
  }
}

export async function setTech(woId: string, tech: StaffMember | null, by: string): Promise<void> {
  await ensureTable();
  if (!tech) {
    await prisma.$executeRaw(Prisma.sql`DELETE FROM work_order_techs WHERE wo_id = ${woId}`);
    return;
  }
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO work_order_techs (wo_id, tech_email, tech_name, assigned_by, assigned_at)
    VALUES (${woId}, ${tech.email}, ${tech.name}, ${by}, now())
    ON CONFLICT (wo_id) DO UPDATE
      SET tech_email = EXCLUDED.tech_email, tech_name = EXCLUDED.tech_name,
          assigned_by = EXCLUDED.assigned_by, assigned_at = now()`);
}
