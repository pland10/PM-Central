import { normalizeStatus } from "@/lib/showings-normalize";

// Tenant Turner → Showing table, by PULLING from Tenant Turner's REST API on a
// schedule (/api/cron/tenantturner), instead of relying on its webhook (which
// never delivered). Each run asks for the applications (leads) changed since
// the last run; each application carries its showings. Upserts on
// (source, externalId) = ("tenantturner", showingId) — the same key the webhook
// and the old leadsimple-search backfill use — so re-runs are idempotent.
//
// Field mapping mirrors leadsimple-search's tenantturner_showings_backfill.py,
// which was verified against the live API. The live API returns PascalCase
// keys (the OpenAPI spec says camelCase), so everything is read lower-cased.
// Pure orchestration (deps injected); the live deps are in ./sync-live.ts.

export type TtRecord = Record<string, unknown>;

// Every record is read through this: keys lower-cased, so either casing works.
export function lowerKeys(v: unknown): TtRecord {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v as TtRecord).map(([k, val]) => [k.toLowerCase(), val]));
}

const str = (v: unknown): string | undefined => {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
};
const idStr = (v: unknown): string | undefined =>
  typeof v === "number" && Number.isFinite(v) ? String(Math.trunc(v)) : str(v);
const intOrUndef = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  return undefined;
};
const dateOrUndef = (v: unknown): Date | undefined => {
  const s = str(v);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export type ShowingInput = {
  externalId: string;
  status: string;
  viewingType?: string;
  startTime?: Date;
  requestedTime1?: Date;
  requestedTime2?: Date;
  requestedTime3?: Date;
  leadSubmittedAt?: Date;
  bookedAt?: Date;
  leadName?: string;
  leadEmail?: string;
  leadPhone?: string;
  moveIn?: string;
  acquisitionSource?: string;
  agentName?: string;
  agentEmail?: string;
  agentPhone?: string;
  feedbackRating?: number;
  feedbackComments?: string;
  lockboxCodeSentAt?: Date;
  ttPropertyId?: string;
  ttAddress?: string;
  ttCity?: string;
  ttState?: string;
  ttZip?: string;
};

// One application (lower-keyed) → a row per showing. `prop` is the Tenant
// Turner property (lower-keyed), for the address snapshot; may be unknown.
export function showingsFromApplication(app: TtRecord, prop: TtRecord | undefined): ShowingInput[] {
  const leadName = [str(app.firstname), str(app.lastname)].filter(Boolean).join(" ") || undefined;
  const showings = Array.isArray(app.showings) ? app.showings : [];
  const out: ShowingInput[] = [];
  for (const raw of showings) {
    const sh = lowerKeys(raw);
    const externalId = idStr(sh.showingid);
    if (!externalId) continue;
    const user = lowerKeys(sh.user);
    const fb = lowerKeys(sh.showingfeedback);
    out.push({
      externalId,
      status: normalizeStatus(str(sh.status), undefined) ?? "scheduled",
      viewingType: str(sh.viewingtype),
      startTime: dateOrUndef(sh.starttime),
      requestedTime1: dateOrUndef(sh.requestedtime1),
      requestedTime2: dateOrUndef(sh.requestedtime2),
      requestedTime3: dateOrUndef(sh.requestedtime3),
      leadSubmittedAt: dateOrUndef(app.datecreated),
      bookedAt: dateOrUndef(sh.datecreated),
      leadName,
      leadEmail: str(app.email),
      leadPhone: str(app.phone),
      moveIn: str(app.movein),
      acquisitionSource: str(app.acquisitionsource),
      agentName: str(user.name),
      agentEmail: str(user.email),
      agentPhone: str(user.phone),
      feedbackRating: intOrUndef(fb.rating),
      feedbackComments: str(fb.comments),
      lockboxCodeSentAt: dateOrUndef(sh.codesent),
      ttPropertyId: idStr(app.propertyid),
      ttAddress: str(prop?.address),
      ttCity: str(prop?.city),
      ttState: str(prop?.state),
      ttZip: str(prop?.zipcode),
    });
  }
  return out;
}

// The next run starts this long before the current one began, so an
// application updated while a run was in flight is never missed.
export const TT_OVERLAP_MS = 10 * 60_000;
const DETAIL_CONCURRENCY = 6;

export type TtSyncDeps = {
  loadSince: () => Promise<string | null>;
  saveSince: (iso: string) => Promise<void>;
  listProperties: () => Promise<TtRecord[]>; // lower-keyed
  listChangedApplications: (sinceIso: string) => Promise<TtRecord[]>; // lower-keyed, all pages
  getApplication: (id: string) => Promise<TtRecord | null>; // lower-keyed
  upsertShowing: (s: ShowingInput) => Promise<{ linked: boolean }>;
  defaultSince: string; // where the first run starts
  sinceOverride?: string; // a backfill's explicit start
  now?: () => Date;
  // Diagnostics: the field names seen on applications / showings (names only).
  onFields?: (applicationKeys: string[], showingKeys: string[]) => void;
};

export type TtSyncResult = { since: string; applications: number; showings: number; linked: number; failed: number };

export async function runTenantTurnerSync(deps: TtSyncDeps): Promise<TtSyncResult> {
  const startedAt = (deps.now ?? (() => new Date()))();
  const since = deps.sinceOverride ?? (await deps.loadSince()) ?? deps.defaultSince;

  const [props, apps] = await Promise.all([deps.listProperties(), deps.listChangedApplications(since)]);
  const propById = new Map<string, TtRecord>();
  for (const p of props) {
    const id = idStr(p.propertyid);
    if (id) propById.set(id, p);
  }

  // Applications whose showings weren't in the list response are fetched one by one.
  let failed = 0;
  const full: TtRecord[] = [];
  const needDetail: TtRecord[] = [];
  for (const a of apps) (Array.isArray(a.showings) ? full : needDetail).push(a);
  for (let i = 0; i < needDetail.length; i += DETAIL_CONCURRENCY) {
    const batch = needDetail.slice(i, i + DETAIL_CONCURRENCY);
    const got = await Promise.all(
      batch.map(async (a) => {
        const id = idStr(a.applicationid);
        if (!id) return null;
        try {
          return await deps.getApplication(id);
        } catch {
          failed++;
          return null;
        }
      })
    );
    for (const g of got) if (g) full.push(g);
  }

  if (deps.onFields) {
    const appKeys = new Set<string>();
    const showingKeys = new Set<string>();
    for (const a of full) {
      Object.keys(a).forEach((k) => appKeys.add(k));
      for (const sh of Array.isArray(a.showings) ? a.showings : []) Object.keys(lowerKeys(sh)).forEach((k) => showingKeys.add(k));
    }
    deps.onFields([...appKeys].sort(), [...showingKeys].sort());
  }

  let showings = 0;
  let linked = 0;
  const seen = new Set<string>();
  for (const a of full) {
    for (const s of showingsFromApplication(a, propById.get(idStr(a.propertyid) ?? ""))) {
      if (seen.has(s.externalId)) continue;
      seen.add(s.externalId);
      const r = await deps.upsertShowing(s);
      showings++;
      if (r.linked) linked++;
    }
  }

  // Only move the checkpoint when every changed application was read, so a
  // failure is retried next run (upserts make the re-run harmless). A backfill
  // with an explicit start date still moves it forward.
  if (failed === 0) await deps.saveSince(new Date(startedAt.getTime() - TT_OVERLAP_MS).toISOString());

  return { since, applications: apps.length, showings, linked, failed };
}
