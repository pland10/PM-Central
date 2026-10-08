import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isTerminal, pipelineRank, type WorkOrderRow } from "@/lib/work-orders";

// Work-order summary for the dashboard, read from the Neon `work_orders` table
// that work_order_sync.py (LeadSimple) populates. Server-only. Returns null if
// the table isn't there yet, so the pane hides instead of erroring. The stage
// ordering + terminal rules live in @/lib/work-orders (shared with the full
// /work-orders page).

export type StageCount = { stage: string; count: number };

export type WorkOrderSummary = {
  stages: StageCount[]; // open stages only, in pipeline order (latest stage first)
  total: number; // all work orders, including terminal
  openTotal: number; // sum of the open stages shown
};

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

type RawRow = {
  source_id: string;
  wo_number: string | null;
  title: string | null;
  name: string | null;
  stage: string | null;
  property_address: string | null;
  vendor_name: string | null;
  assignee_name: string | null;
  link: string | null;
};

// Full work-order list for the /work-orders page. Returns null if the table
// isn't there yet (so the page can degrade gracefully instead of erroring).
export async function listWorkOrders(): Promise<WorkOrderRow[] | null> {
  try {
    const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT source_id, wo_number, title, name, stage,
             property_address, vendor_name, assignee_name, link
      FROM work_orders`);

    return rows.map((r) => {
      const stage = r.stage ?? "—";
      return {
        id: r.source_id,
        number: r.wo_number ?? "—",
        issue: r.title || r.name || "Work order",
        stage,
        terminal: isTerminal(stage),
        property: r.property_address ?? "—",
        vendor: r.vendor_name ?? "",
        assignee: r.assignee_name ?? "",
        link: r.link ?? "",
      };
    });
  } catch {
    return null;
  }
}
