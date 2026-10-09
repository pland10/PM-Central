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

// Rentvine enrichment keyed by work-order number: priority + a link to our
// Property record. Best-effort — the rv_work_orders table may not exist yet
// (before the first Rentvine WO sync), so this never fails the main listing.
async function rentvineEnrichment(): Promise<
  Map<string, { priority: string; propertyId: string | null }>
> {
  const out = new Map<string, { priority: string; propertyId: string | null }>();
  try {
    const [rvRows, props] = await Promise.all([
      prisma.$queryRaw<{ wo_number: string; property_external_id: string | null; priority: string | null }[]>(
        Prisma.sql`SELECT wo_number, property_external_id, priority FROM rv_work_orders`
      ),
      prisma.property.findMany({
        where: { source: "rentvine" },
        select: { id: true, externalId: true },
      }),
    ]);
    const propByExt = new Map(props.map((p) => [p.externalId ?? "", p.id]));
    for (const r of rvRows) {
      out.set(r.wo_number, {
        priority: r.priority ?? "",
        propertyId: r.property_external_id ? propByExt.get(r.property_external_id) ?? null : null,
      });
    }
  } catch {
    // No rv_work_orders table yet (or query failed) — return what we have.
  }
  return out;
}

// Full work-order list for the /work-orders page, LeadSimple rows (which carry
// the stage) enriched with Rentvine priority + property link by WO number.
// Returns null if the LeadSimple table isn't there yet (so the page can degrade
// gracefully instead of erroring).
export async function listWorkOrders(): Promise<WorkOrderRow[] | null> {
  try {
    const [rows, rv] = await Promise.all([
      prisma.$queryRaw<RawRow[]>(Prisma.sql`
        SELECT source_id, wo_number, title, name, stage,
               property_address, vendor_name, assignee_name, link
        FROM work_orders`),
      rentvineEnrichment(),
    ]);

    return rows.map((r) => {
      const stage = r.stage ?? "—";
      const number = r.wo_number ?? "—";
      const enrich = rv.get(number);
      return {
        id: r.source_id,
        number,
        issue: r.title || r.name || "Work order",
        stage,
        terminal: isTerminal(stage),
        property: r.property_address ?? "—",
        vendor: r.vendor_name ?? "",
        assignee: r.assignee_name ?? "",
        link: r.link ?? "",
        priority: enrich?.priority ?? "",
        propertyId: enrich?.propertyId ?? null,
      };
    });
  } catch {
    return null;
  }
}
