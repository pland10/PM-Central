import { prisma } from "@/lib/prisma";

// Tenant Turner showings — webhook ingestion + read models.
//
// Tenant Turner pushes an event per viewing lifecycle step (Viewing Requested/
// Scheduled/Confirmed/Cancelled/No Show/Feedback) plus Lockbox Code Sent. Every
// one of those payloads bundles three objects:
//
//   property    — id + denormalized address (NO externalId)
//   application — the lead (name, email, phone, move-in, acquisition source)
//   showing     — id, status, times, viewing type, assigned user/agent
//
// We upsert one Showing row per showingId (idempotent on re-delivery) and
// best-effort link it to one of our Property records by address. See
// src/app/api/webhooks/tenantturner for the receiver.

const SOURCE = "tenantturner";

// ---- safe extractors for untrusted webhook JSON ---------------------------

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | undefined {
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? undefined : t;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

function idStr(v: unknown): string | undefined {
  // showingId / propertyId come through as integer OR string.
  if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(v));
  return str(v);
}

function intOrNull(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Math.trunc(Number(v));
  }
  return undefined;
}

function dateOrNull(v: unknown): Date | undefined {
  const s = str(v);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// ---- status normalization --------------------------------------------------

// Our canonical statuses. We prefer Tenant Turner's own showing.status, falling
// back to the event name, so we track whatever values TT actually sends without
// hard-coding their exact casing.
export type ShowingStatus =
  | "requested"
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no-show";

function normalizeStatus(
  showingStatus: string | undefined,
  eventType: string | undefined
): ShowingStatus | undefined {
  const hay = `${showingStatus ?? ""} ${eventType ?? ""}`.toLowerCase();
  if (/cancel/.test(hay)) return "cancelled";
  if (/no.?show/.test(hay)) return "no-show";
  if (/confirm/.test(hay)) return "confirmed";
  if (/feedback|complete|attended/.test(hay)) return "completed";
  if (/request/.test(hay)) return "requested";
  if (/schedul/.test(hay)) return "scheduled";
  return undefined;
}

// ---- property matching -----------------------------------------------------

// Normalize a street line for comparison: lowercase, drop punctuation, collapse
// whitespace. Good enough to match "123 Main St." to "123 Main St".
function normStreet(s: string | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function zip5(s: string | undefined): string {
  return (s ?? "").replace(/[^0-9]/g, "").slice(0, 5);
}

// Best-effort: find our Property whose street+zip match the showing's address.
// Returns the Property id, or null when nothing matches confidently.
async function matchPropertyId(
  address: string | undefined,
  zip: string | undefined
): Promise<string | null> {
  const wantStreet = normStreet(address);
  const wantZip = zip5(zip);
  if (!wantStreet || !wantZip) return null;

  const candidates = await prisma.property.findMany({
    where: { zip: { startsWith: wantZip } },
    select: { id: true, street1: true },
  });
  const hit = candidates.find((p) => normStreet(p.street1) === wantStreet);
  return hit?.id ?? null;
}

// ---- event ingestion -------------------------------------------------------

export type IngestResult =
  | { ok: true; showingId: string; status: ShowingStatus | null; linked: boolean }
  | { ok: false; reason: string };

// Apply one Tenant Turner webhook payload. Only builds fields present in the
// payload, so a partial event (e.g. Lockbox Code Sent) never clobbers lead data
// set by an earlier event.
export async function applyTenantTurnerEvent(payload: unknown): Promise<IngestResult> {
  const body = asRecord(payload);
  const showing = asRecord(body.showing);
  const property = asRecord(body.property);
  const application = asRecord(body.application);
  const agent = asRecord(showing.user);

  const eventType = str(body.eventType);
  const externalId = idStr(showing.showingId);

  // Events without a showing (e.g. Lead Created/Updated) aren't showings.
  if (!externalId) {
    return { ok: false, reason: `No showingId on event${eventType ? ` "${eventType}"` : ""}.` };
  }

  const status = normalizeStatus(str(showing.status), eventType);

  const ttAddress = str(property.address);
  const ttZip = str(property.zipCode);
  const propertyId = await matchPropertyId(ttAddress, ttZip);

  const leadName =
    [str(application.firstName), str(application.lastName)].filter(Boolean).join(" ") || undefined;

  // Feedback arrives at the top level of the Viewing Feedback event.
  const feedbackRating = intOrNull(body.rating);
  const feedbackComments = str(body.showingComments);

  // Lockbox Code Sent carries codeSent at the top level.
  const lockboxCodeSentAt = dateOrNull(body.codeSent);

  // Build only the fields this event actually carried. undefined => untouched
  // on update, null/default on create.
  const common = {
    ...(status ? { status } : {}),
    ...(str(showing.viewingType) ? { viewingType: str(showing.viewingType) } : {}),
    ...(dateOrNull(showing.startTime) ? { startTime: dateOrNull(showing.startTime) } : {}),
    ...(dateOrNull(showing.requestedTime1) ? { requestedTime1: dateOrNull(showing.requestedTime1) } : {}),
    ...(dateOrNull(showing.requestedTime2) ? { requestedTime2: dateOrNull(showing.requestedTime2) } : {}),
    ...(dateOrNull(showing.requestedTime3) ? { requestedTime3: dateOrNull(showing.requestedTime3) } : {}),

    ...(leadName ? { leadName } : {}),
    ...(str(application.email) ? { leadEmail: str(application.email) } : {}),
    ...(str(application.phone) ? { leadPhone: str(application.phone) } : {}),
    ...(str(application.moveIn) ? { moveIn: str(application.moveIn) } : {}),
    ...(str(application.acquisitionSource) ? { acquisitionSource: str(application.acquisitionSource) } : {}),

    ...(str(agent.name) ? { agentName: str(agent.name) } : {}),
    ...(str(agent.email) ? { agentEmail: str(agent.email) } : {}),
    ...(str(agent.phone) ? { agentPhone: str(agent.phone) } : {}),

    ...(feedbackRating != null ? { feedbackRating } : {}),
    ...(feedbackComments ? { feedbackComments } : {}),
    ...(lockboxCodeSentAt ? { lockboxCodeSentAt } : {}),

    ...(idStr(property.propertyId) ? { ttPropertyId: idStr(property.propertyId) } : {}),
    ...(ttAddress ? { ttAddress } : {}),
    ...(str(property.city) ? { ttCity: str(property.city) } : {}),
    ...(str(property.state) ? { ttState: str(property.state) } : {}),
    ...(ttZip ? { ttZip } : {}),

    // Only (re)link when we found a match; never null out an existing link.
    ...(propertyId ? { propertyId } : {}),

    ...(eventType ? { lastEventType: eventType } : {}),
    lastEventAt: new Date(),
  };

  // The webhook doesn't carry the showing's dateCreated, so approximate "booked"
  // with the event time, set once on create and never overwritten by later
  // events. (leadSubmittedAt isn't in the webhook at all — the backfill fills it.)
  const bookedAt = dateOrNull(body.eventDate);

  await prisma.showing.upsert({
    where: { source_externalId: { source: SOURCE, externalId } },
    create: {
      source: SOURCE,
      externalId,
      status: status ?? "scheduled",
      ...common,
      ...(bookedAt ? { bookedAt } : {}),
    },
    update: common,
  });

  return { ok: true, showingId: externalId, status: status ?? null, linked: !!propertyId };
}

// ---- read model (Showings page) -------------------------------------------

export type ShowingRow = {
  id: string;
  status: string;
  viewingType: string | null;
  startTime: string | null; // ISO
  address: string; // best address we have (our Property, else TT snapshot)
  propertyId: string | null; // our Property id when linked
  leadName: string | null;
  leadEmail: string | null;
  leadPhone: string | null;
  moveIn: string | null; // lead's desired move-in (ISO or free text)
  leadSubmittedAt: string | null; // ISO — when the lead inquired (backfill only)
  bookedAt: string | null; // ISO — when the showing was created/requested
  agentName: string | null;
  acquisitionSource: string | null;
  feedbackRating: number | null;
  feedbackComments: string | null;
  lockboxCodeSentAt: string | null; // ISO
  updatedAt: string; // ISO
};

function fmtAddress(parts: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  const line1 = parts.street ?? "";
  const tail = [parts.city, parts.state].filter(Boolean).join(", ");
  const rest = [tail, parts.zip].filter(Boolean).join(" ");
  return [line1, rest].filter(Boolean).join(" · ") || "Unknown address";
}

// All showings, newest activity first. Returns null if nothing has synced yet.
export async function listShowings(): Promise<ShowingRow[] | null> {
  let rows;
  try {
    rows = await prisma.showing.findMany({
      orderBy: [{ startTime: "desc" }, { updatedAt: "desc" }],
      include: {
        property: { select: { id: true, name: true, street1: true, city: true, state: true, zip: true } },
      },
      take: 2000,
    });
  } catch {
    return null; // table not migrated yet
  }
  if (rows.length === 0) return [];

  return rows.map((r): ShowingRow => {
    const address = r.property
      ? fmtAddress({
          street: r.property.street1,
          city: r.property.city,
          state: r.property.state,
          zip: r.property.zip,
        })
      : fmtAddress({ street: r.ttAddress, city: r.ttCity, state: r.ttState, zip: r.ttZip });
    return {
      id: r.id,
      status: r.status,
      viewingType: r.viewingType,
      startTime: r.startTime ? r.startTime.toISOString() : null,
      address,
      propertyId: r.propertyId,
      leadName: r.leadName,
      leadEmail: r.leadEmail,
      leadPhone: r.leadPhone,
      moveIn: r.moveIn,
      leadSubmittedAt: r.leadSubmittedAt ? r.leadSubmittedAt.toISOString() : null,
      bookedAt: r.bookedAt ? r.bookedAt.toISOString() : null,
      agentName: r.agentName,
      acquisitionSource: r.acquisitionSource,
      feedbackRating: r.feedbackRating,
      feedbackComments: r.feedbackComments,
      lockboxCodeSentAt: r.lockboxCodeSentAt ? r.lockboxCodeSentAt.toISOString() : null,
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}
