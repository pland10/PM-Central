import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isMeetingDate } from "@/lib/meetings";
import { upsertMeetingNote } from "@/lib/meetings-db";

// Save one house's note for a meeting date: { propertyId, date (YYYY-MM-DD),
// body }. Any signed-in user. An empty body clears the note.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => null);
  const propertyId = typeof b?.propertyId === "string" ? b.propertyId.trim() : "";
  const date = b?.date;
  const body = typeof b?.body === "string" ? b.body : "";
  if (!propertyId || !isMeetingDate(date)) {
    return NextResponse.json({ error: "Need a property and a valid meeting date." }, { status: 400 });
  }

  try {
    await upsertMeetingNote(propertyId, date, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[meetings] save note failed:", e);
    return NextResponse.json({ error: "Could not save the note." }, { status: 500 });
  }
}
