import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Work-order summary for the dashboard, read from the Neon `work_orders` table
// that work_order_sync.py (LeadSimple) populates. Server-only. Returns null if
// the table isn't there yet, so the pane hides instead of erroring.

export type StageCount = { stage: string; count: number };

export type WorkOrderSummary = {
  stages: StageCount[]; // every stage, most common first
  total: number;
  openTotal: number; // excludes terminal (completed / cancelled) stages
};

// Stages that mean the work order is done — excluded from the "open" headline.
function isTerminal(stage: string): boolean {
  return /complete|cancel|closed|lost/i.test(stage);
}

export async function workOrderStageSummary(): Promise<WorkOrderSummary | null> {
  try {
    const rows = await prisma.$queryRaw<{ stage: string | null; count: number }[]>(Prisma.sql`
      SELECT stage, count(*)::int AS count
      FROM work_orders
      GROUP BY stage
      ORDER BY count(*) DESC`);

    const stages = rows
      .filter((r) => r.stage)
      .map((r) => ({ stage: r.stage as string, count: Number(r.count) }));
    const total = stages.reduce((s, r) => s + r.count, 0);
    const openTotal = stages
      .filter((r) => !isTerminal(r.stage))
      .reduce((s, r) => s + r.count, 0);

    return { stages, total, openTotal };
  } catch {
    return null;
  }
}
