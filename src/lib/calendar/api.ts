import { NextResponse } from "next/server";
import { isFeatureEnabled } from "@/config/features";
import { listStaff } from "@/lib/staff";
import { sanitizeEvent, type CalendarEventInput } from "@/lib/calendar/events";

// Shared bits for the /api/calendar routes.

export const notFound = () => NextResponse.json({ error: "Not found." }, { status: 404 });
export const calendarOff = () => !isFeatureEnabled("calendar");

// Validate an event body; the owner (optional) must be someone who uses
// PM Central — their name comes from the staff list.
export async function readEvent(
  raw: unknown
): Promise<{ ok: true; value: CalendarEventInput & { ownerName: string | null } } | { ok: false; response: NextResponse }> {
  const clean = sanitizeEvent(raw);
  if (!clean.ok) return { ok: false, response: NextResponse.json({ error: clean.error }, { status: 400 }) };
  let ownerName: string | null = null;
  if (clean.value.ownerEmail) {
    const owner = (await listStaff()).find((s) => s.email.toLowerCase() === clean.value.ownerEmail);
    if (!owner) return { ok: false, response: NextResponse.json({ error: "Pick an owner who uses PM Central." }, { status: 400 }) };
    ownerName = owner.name;
  }
  return { ok: true, value: { ...clean.value, ownerName } };
}
