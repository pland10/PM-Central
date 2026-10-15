import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Neon-backed data layer for Search (Phase 3). The synced `activities` feed and
// the `sync_status` heartbeat now live in the single Neon DB (see
// prisma/sql/search.sql), so these run raw SQL via Prisma instead of the old
// Supabase client. Keys never reach the browser — this is server-only.

// Pipelines that are internal team chatter (e.g. RingCentral Team Messaging),
// not owner/tenant communication. These are kept OUT of the main Search and
// surfaced on their own "Team Comms" page instead.
export const INTERNAL_PIPELINES = ["RingCentral"];

export type SearchFilters = {
  q: string;
  dir: string;
  taskStatus: string;
  types: string[];
  contact: string;
  property: string;
  pipeline: string;
  // "external" (default) = owner/tenant Search, hides INTERNAL_PIPELINES.
  // "internal" = Team Comms, shows only INTERNAL_PIPELINES.
  scope?: "external" | "internal";
};

// Every column except search_vector (a tsvector, not meant for the client).
const COLUMNS = Prisma.sql`
  id, source_id, type, content, subject, direction, outcome, duration,
  deal_id, deal_name, pipeline_name, contact_names, contact_emails,
  contact_phones, assignee_name, property_address, ls_link, due_at,
  completed_at, created_at, synced_at, attachments`;

// Fields the autocomplete can suggest over. Allow-listed so the column name can
// be interpolated into SQL safely (never user-controlled).
export const SUGGEST_FIELDS = ["contact_names", "property_address", "pipeline_name"];

function buildWhere(f: SearchFilters): Prisma.Sql {
  const conds: Prisma.Sql[] = [];

  // Segregate internal team chatter from owner/tenant comms. Default (external)
  // hides the internal pipelines; Team Comms asks for them explicitly.
  if (f.scope === "internal") {
    conds.push(Prisma.sql`pipeline_name IN (${Prisma.join(INTERNAL_PIPELINES)})`);
  } else {
    conds.push(
      Prisma.sql`(pipeline_name IS NULL OR pipeline_name NOT IN (${Prisma.join(INTERNAL_PIPELINES)}))`
    );
  }

  if (f.types.length) conds.push(Prisma.sql`type IN (${Prisma.join(f.types)})`);

  // Task open/closed — constrains tasks without excluding other selected types.
  if (f.types.includes("task") && (f.taskStatus === "open" || f.taskStatus === "closed")) {
    conds.push(
      f.taskStatus === "open"
        ? Prisma.sql`(type <> 'task' OR completed_at IS NULL)`
        : Prisma.sql`(type <> 'task' OR completed_at IS NOT NULL)`
    );
  }

  // Scope: contact/property match either (OR); pipeline is ANDed on top. Values
  // are bound as parameters, so no escaping is needed for safety.
  const orParts: Prisma.Sql[] = [];
  if (f.contact) orParts.push(Prisma.sql`contact_names ILIKE ${`%${f.contact}%`}`);
  if (f.property) orParts.push(Prisma.sql`property_address ILIKE ${`%${f.property}%`}`);
  if (orParts.length) conds.push(Prisma.sql`(${Prisma.join(orParts, " OR ")})`);
  if (f.pipeline) conds.push(Prisma.sql`pipeline_name ILIKE ${`%${f.pipeline}%`}`);

  // Direction — rows with no direction (notes, tasks, some calls) match either.
  if (f.dir === "inbound" || f.dir === "outbound") {
    conds.push(Prisma.sql`(direction = ${f.dir} OR direction IS NULL)`);
  }

  if (f.q) conds.push(Prisma.sql`search_vector @@ websearch_to_tsquery('english', ${f.q})`);

  return conds.length ? Prisma.join(conds, " AND ") : Prisma.sql`TRUE`;
}

// The RingCentral chat sync adds activities.attachments; make sure the column
// exists before SELECTing it, so Search/Team Comms don't break if PM-Central
// deploys before that sync has run. Additive + idempotent; runs once per
// process (cached promise).
let attachmentsColumn: Promise<void> | null = null;
function ensureAttachmentsColumn(): Promise<void> {
  if (!attachmentsColumn) {
    attachmentsColumn = prisma
      .$executeRawUnsafe(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS attachments jsonb`)
      .then(() => undefined)
      .catch((e) => {
        attachmentsColumn = null; // let a later call retry
        throw e;
      });
  }
  return attachmentsColumn;
}

export async function searchActivities(
  f: SearchFilters,
  offset: number,
  limit: number
): Promise<Record<string, unknown>[]> {
  await ensureAttachmentsColumn();
  const where = buildWhere(f);
  return prisma.$queryRaw<Record<string, unknown>[]>(
    Prisma.sql`SELECT ${COLUMNS} FROM activities WHERE ${where}
               ORDER BY created_at DESC NULLS LAST
               LIMIT ${limit} OFFSET ${offset}`
  );
}

export async function countActivities(f: SearchFilters): Promise<number> {
  const where = buildWhere(f);
  const res = await prisma.$queryRaw<{ count: number }[]>(
    Prisma.sql`SELECT COUNT(*)::int AS count FROM activities WHERE ${where}`
  );
  return res[0]?.count ?? 0;
}

export async function suggestValues(field: string, val: string): Promise<string[]> {
  if (!SUGGEST_FIELDS.includes(field)) return [];
  const col = Prisma.raw(field); // safe: validated against the allow-list above
  // The pipeline suggestions feed the main (external) Search, so never suggest
  // an internal pipeline there — those belong to Team Comms.
  const hideInternal =
    field === "pipeline_name"
      ? Prisma.sql`AND ${col} NOT IN (${Prisma.join(INTERNAL_PIPELINES)})`
      : Prisma.empty;
  const rows = await prisma.$queryRaw<{ v: string | null }[]>(
    Prisma.sql`SELECT DISTINCT ${col} AS v FROM activities
               WHERE ${col} ILIKE ${`%${val}%`} AND ${col} IS NOT NULL AND ${col} <> ''
               ${hideInternal}
               LIMIT 50`
  );
  return rows.map((r) => r.v ?? "").filter(Boolean);
}

export type SyncStatusRow = { job: string; last_run_at: Date | null; detail: string | null };

export async function syncStatusRows(): Promise<SyncStatusRow[]> {
  const rows = await prisma.$queryRaw<SyncStatusRow[]>(
    Prisma.sql`SELECT job, last_run_at, detail FROM sync_status`
  );
  // Exclude internal bookkeeping rows (sync cursors, job names starting with
  // "_") — they aren't real heartbeats and their detail JSON contains
  // "stuck_since", which would false-match the stuck check in the status route.
  return rows.filter((r) => r.job && !String(r.job).startsWith("_"));
}

// Heartbeat for a single sync job (e.g. the RingCentral chat sync behind Team
// Comms). Returns null when the job hasn't recorded a run yet.
export async function syncStatusForJob(job: string): Promise<SyncStatusRow | null> {
  const rows = await prisma.$queryRaw<SyncStatusRow[]>(
    Prisma.sql`SELECT job, last_run_at, detail FROM sync_status WHERE job = ${job} LIMIT 1`
  );
  return rows[0] ?? null;
}
