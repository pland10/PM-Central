// Shared work-order types + stage ordering logic. PURE (no Prisma import) so it
// is safe to import from client components as well as the server data layer in
// work-orders-dashboard.ts.
//
// Work orders live in LeadSimple (not Rentvine): they're process items whose
// *stage* is the status the team follows up on. The Neon `work_orders` table
// (populated by work_order_sync.py, raw SQL outside Prisma) is read in
// work-orders-dashboard.ts.
//
// The join key back to Rentvine is the work-order NUMBER (`number` here =
// Rentvine's workOrderNumber). When a live Rentvine work-order sync exists, rows
// can be enriched (clickable property, priority, cost) by matching on that
// number. Today the page is LeadSimple-only.

// The Work Orders process stages in LeadSimple pipeline order, earliest →
// latest (from GET /process_types/{id}/stages). Lists are ordered by the REVERSE
// of this (latest stage first) so the ones that have progressed but aren't
// closed — the follow-ups — sit at the top. Unknown stages sort last.
export const STAGE_ORDER = [
  "New WO",
  "Troubleshooting",
  "Assigning in Progress",
  "Scheduling in Progress",
  "Work Scheduled & Confirm Completion",
  "Work Completed - Awaiting Invoice",
  "Invoice Received",
];

export function pipelineRank(stage: string): number {
  const i = STAGE_ORDER.indexOf(stage);
  return i === -1 ? -1 : i; // unknown → -1, sorts last in a descending sort
}

// Stages that mean the work order is off the active board (completed / cancelled
// / deferred, etc.) — hidden from the dashboard, toggleable on the full page.
export function isTerminal(stage: string): boolean {
  return /complete|cancel|closed|lost|defer/i.test(stage);
}

export type WorkOrderRow = {
  id: string; // LeadSimple process id (source_id)
  number: string; // wo_number (= Rentvine workOrderNumber), or "—"
  issue: string; // title / job description
  stage: string;
  terminal: boolean;
  property: string;
  vendor: string;
  assignee: string;
  link: string; // LeadSimple deep link
  // Enrichment from Rentvine, merged on the work-order number (null when the WO
  // isn't in Rentvine or its property isn't a record we hold).
  priority: string; // Low | Medium | High | ""
  propertyId: string | null; // our Property.id, for a clickable link
  // Latest update from the Rentvine work-order chat/updates thread (from the
  // synced `activities` feed), or "" / null when the WO has no updates.
  lastUpdate: string;
  lastUpdateAt: string | null; // ISO
};

// Sort rank for priority (High first); unknown/none sorts last.
export function priorityRank(p: string): number {
  return p === "High" ? 3 : p === "Medium" ? 2 : p === "Low" ? 1 : 0;
}
