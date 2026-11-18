// Tenant Turner showing status → our canonical status. Pure; shared by the
// webhook receiver (./showings.ts) and the API sync (./tenantturner/sync.ts).

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

export function normalizeStatus(
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

