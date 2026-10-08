import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Work-order summary for the dashboard, read from the Neon `work_orders` table
// that work_order_sync.py (LeadSimple) populates. Server-only. Returns null if
// the table isn't there yet, so the pane hides instead of erroring.

export type StageCount = { stage: string; count: number };

export type WorkOrderSummary = {
  stages: StageCount[]; // open stages only, in pipeline order (latest stage first)
  total: number; // all work orders, including terminal
  openTotal: number; // sum of the open stages shown
};

// Stages that mean the work order is off the active board — not shown on the
// dashboard (completed / cancelled / deferred, etc.).
function isTerminal(stage: string): boolean {
  return /complete|cancel|closed|lost|defer/i.test(stage);
}

// The Work Orders process stages in LeadSimple pipeline order, earliest →
// latest (from GET /process_types/{id}/stages). The dashboard lists them in
// REVERSE of this (latest stage first) so the ones that have progressed but
// aren't closed — the follow-ups — sit at the top. Unknown stages sort last.
const STAGE_ORDER = [
  "New WO",
  "Troubleshooting",
  "Assigning in Progress",
  "Scheduling in Progress",
  "Work Scheduled & Confirm Completion",
  "Work Completed - Awaiting Invoice",
  "Invoice Received",
];

function pipelineRank(stage: string): number {
  const i = STAGE_ORDER.indexOf(stage);
  return i === -1 ? -1 : i; // unknown → -1, sorts last in a descending sort
}

export async function workOrderStageSummary(): Promise<WorkOrderSummary | null> {
  try {
    const rows = await prisma.$queryRaw<{ stage: string | null; count: number }[]>(Prisma.sql`
      SELECT stage, count(*)::int AS count
      FROM work_orders
      GROUP BY stage
      ORDER BY count(*) DESC`);

    const all = rows
      .filter((r) => r.stage)
      .map((r) => ({ stage: r.stage as string, count: Number(r.count) }));
    const total = all.reduce((s, r) => s + r.count, 0);
    // Open/active stages only, ordered by pipeline sequence descending
    // (latest stage first).
    const stages = all
      .filter((r) => !isTerminal(r.stage))
      .sort((a, b) => pipelineRank(b.stage) - pipelineRank(a.stage));
    const openTotal = stages.reduce((s, r) => s + r.count, 0);

    return { stages, total, openTotal };
  } catch {
    return null;
  }
}
