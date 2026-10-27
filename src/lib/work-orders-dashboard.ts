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
    // Count open rows per stage by LeadSimple's own close signal (closed_at),
    // not the stage name alone: a WO LeadSimple has closed that ended in a
    // stage whose name doesn't match the terminal regex (e.g. "Invoice
    // Received") would otherwise inflate the open count vs. Rentvine.
    const rows = await prisma.$queryRaw<{ stage: string | null; open_count: number; total_count: number }[]>(Prisma.sql`
      SELECT stage,
             count(*) FILTER (WHERE closed_at IS NULL)::int AS open_count,
             count(*)::int AS total_count
      FROM work_orders
      GROUP BY stage
      ORDER BY count(*) DESC`);

    const all = rows
      .filter((r) => r.stage)
      .map((r) => ({ stage: r.stage as string, open: Number(r.open_count), total: Number(r.total_count) }));
    const total = all.reduce((s, r) => s + r.total, 0);
    // Open/active stages only (not closed in LeadSimple, not a terminal-named
    // stage), ordered by pipeline sequence descending (latest stage first).
    const stages = all
      .filter((r) => !isTerminal(r.stage) && r.open > 0)
      .map((r) => ({ stage: r.stage, count: r.open }))
      .sort((a, b) => pipelineRank(b.stage) - pipelineRank(a.stage));
    const openTotal = all
      .filter((r) => !isTerminal(r.stage))
      .reduce((s, r) => s + r.open, 0);

    return { stages, total, openTotal };
  } catch {
    return null;
  }
}

// A work order is terminal (not counted as open) when LeadSimple has closed it
// — closed_at set — OR its stage name matches the terminal regex. closed_at is
// authoritative; the stage-name check is a fallback for rows closed in
// LeadSimple without a closed_at timestamp.
function woTerminal(stage: string, closedAt: Date | string | null): boolean {
  return Boolean(closedAt) || isTerminal(stage);
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
  closed_at: Date | string | null;
};

type ListRow = RawRow & {
  created_at: Date | string | null;
  updated_at: Date | string | null;
  due_at: string | null; // via to_jsonb, so text (or null when the column isn't there yet)
  rv_status: string | null; // via to_jsonb too (written by the Rentvine status sync)
};

const iso = (v: Date | string | null | undefined): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// A work order flagged for the dashboard's attention panel.
export type WoAlert = {
  number: string;
  issue: string;
  property: string;
  stage: string;
  priority: string; // Low | Medium | High | ""
  propertyId: string | null;
  link: string;
  createdAt: string | null;
};

export type WorkOrderAlerts = {
  recent: WoAlert[]; // open, created within the window (newest first)
  high: WoAlert[]; // open, High priority (newest first)
  windowHours: number;
};

export type AttentionItem = WoAlert & { isNew: boolean; isHigh: boolean };

// The dashboard's "Work orders to review" list: new (in the window) and/or High
// priority, merged — a WO can be both — with High first, then newest.
export function attentionList(alerts: WorkOrderAlerts | null): AttentionItem[] {
  if (!alerts) return [];
  const byNumber = new Map<string, AttentionItem>();
  for (const w of alerts.recent) {
    byNumber.set(w.number, { ...w, isNew: true, isHigh: /high/i.test(w.priority) });
  }
  for (const w of alerts.high) {
    const existing = byNumber.get(w.number);
    if (existing) existing.isHigh = true;
    else byNumber.set(w.number, { ...w, isNew: false, isHigh: true });
  }
  return [...byNumber.values()].sort(
    (a, b) =>
      Number(b.isHigh) - Number(a.isHigh) ||
      new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
  );
}

// New + high-priority OPEN work orders, so a freshly-arrived or urgent WO can't
// slip by unseen. "New" = created within windowHours (default 72h); priority
// comes from the Rentvine enrichment. Null if the work_orders table isn't there.
export async function workOrderAlerts(windowHours = 72): Promise<WorkOrderAlerts | null> {
  try {
    const [rows, rv] = await Promise.all([
      prisma.$queryRaw<(RawRow & { created_at: Date | null })[]>(Prisma.sql`
        SELECT source_id, wo_number, title, name, stage,
               property_address, vendor_name, assignee_name, link, created_at, closed_at
        FROM work_orders`),
      rentvineEnrichment(),
    ]);

    const cutoff = Date.now() - windowHours * 3_600_000;
    type Computed = WoAlert & { terminal: boolean; createdMs: number };
    const computed: Computed[] = rows.map((r) => {
      const stage = r.stage ?? "—";
      const number = r.wo_number ?? "—";
      const enrich = rv.get(number);
      const createdMs = r.created_at ? new Date(r.created_at).getTime() : 0;
      return {
        number,
        issue: r.title || r.name || "Work order",
        property: r.property_address ?? "—",
        stage,
        priority: enrich?.priority ?? "",
        propertyId: enrich?.propertyId ?? null,
        link: r.link ?? "",
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        terminal: woTerminal(stage, r.closed_at),
        createdMs,
      };
    });

    const strip = (c: Computed): WoAlert => ({
      number: c.number,
      issue: c.issue,
      property: c.property,
      stage: c.stage,
      priority: c.priority,
      propertyId: c.propertyId,
      link: c.link,
      createdAt: c.createdAt,
    });
    const open = computed.filter((c) => !c.terminal);
    const recent = open
      .filter((c) => c.createdMs >= cutoff)
      .sort((a, b) => b.createdMs - a.createdMs)
      .map(strip);
    const high = open
      .filter((c) => /high/i.test(c.priority))
      .sort((a, b) => b.createdMs - a.createdMs)
      .map(strip);

    return { recent, high, windowHours };
  } catch {
    return null;
  }
}

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

// Latest update per work order, from the Rentvine work-order chat/updates thread
// that rentvine_chat_sync.py syncs into `activities` (type 'chat', subject
// "Work order chat — Work Order #<number>"). Keyed by WO number. Best-effort:
// the activities table or these rows may be absent, so this never throws.
async function latestWoUpdates(): Promise<Map<string, { text: string; at: string | null }>> {
  const out = new Map<string, { text: string; at: string | null }>();
  try {
    // Newest first; the first row seen per WO number is its latest update.
    const rows = await prisma.$queryRaw<{ deal_name: string | null; content: string | null; created_at: Date | null }[]>(
      Prisma.sql`
        SELECT deal_name, content, created_at
        FROM activities
        WHERE type = 'chat' AND subject LIKE 'Work order chat%'
        ORDER BY created_at DESC NULLS LAST`
    );
    for (const r of rows) {
      const m = /#(\d+)/.exec(r.deal_name ?? "");
      if (!m) continue;
      const number = m[1];
      if (out.has(number)) continue; // already have the newest for this WO
      // content is "<body>\n\nFrom: <author>" — keep the body for display.
      const raw = r.content ?? "";
      const cut = raw.lastIndexOf("\n\nFrom:");
      const text = (cut >= 0 ? raw.slice(0, cut) : raw).trim();
      out.set(number, {
        text,
        at: r.created_at ? new Date(r.created_at).toISOString() : null,
      });
    }
  } catch {
    // No activities table / no such rows — return what we have.
  }
  return out;
}

// Full work-order list for the /work-orders page, LeadSimple rows (which carry
// the stage) enriched with Rentvine priority + property link + the latest update
// note, all merged by WO number. Returns null if the LeadSimple table isn't
// there yet (so the page can degrade gracefully instead of erroring).
export async function listWorkOrders(): Promise<WorkOrderRow[] | null> {
  try {
    const [rows, rv, updates] = await Promise.all([
      // due_at is read through to_jsonb so this works before the sync adds the
      // column (it's then just null) — no deploy-order dependency.
      prisma.$queryRaw<ListRow[]>(Prisma.sql`
        SELECT source_id, wo_number, title, name, stage,
               property_address, vendor_name, assignee_name, link,
               created_at, updated_at, closed_at, to_jsonb(w) ->> 'due_at' AS due_at,
               to_jsonb(w) ->> 'rv_status' AS rv_status
        FROM work_orders w`),
      rentvineEnrichment(),
      latestWoUpdates(),
    ]);

    return rows.map((r) => {
      const stage = r.stage ?? "—";
      const number = r.wo_number ?? "—";
      const enrich = rv.get(number);
      const update = updates.get(number);
      return {
        id: r.source_id,
        number,
        issue: r.title || r.name || "Work order",
        stage,
        terminal: woTerminal(stage, r.closed_at),
        property: r.property_address ?? "—",
        vendor: r.vendor_name ?? "",
        assignee: r.assignee_name ?? "",
        link: r.link ?? "",
        priority: enrich?.priority ?? "",
        propertyId: enrich?.propertyId ?? null,
        lastUpdate: update?.text ?? "",
        lastUpdateAt: update?.at ?? null,
        createdAt: iso(r.created_at),
        updatedAt: iso(r.updated_at),
        closedAt: iso(r.closed_at),
        dueAt: iso(r.due_at),
        rvStatus: r.rv_status ?? "",
      };
    });
  } catch {
    return null;
  }
}
