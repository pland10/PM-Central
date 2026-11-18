import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isMeetingDate } from "@/lib/meetings";
import { upsertTopicNote } from "@/lib/meeting-topics-db";

// Save one topic's note for a strategic-meeting date: { topicId, date, body }.
// Any signed-in user. An empty body clears the note.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => null);
  const topicId = Number(b?.topicId);
  const date = b?.date;
  const body = typeof b?.body === "string" ? b.body : "";
  if (!Number.isInteger(topicId) || topicId <= 0 || !isMeetingDate(date)) {
    return NextResponse.json({ error: "Need a topic and a valid meeting date." }, { status: 400 });
  }

  try {
    await upsertTopicNote(topicId, date, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[meetings] save topic note failed:", e);
    return NextResponse.json({ error: "Could not save the note." }, { status: 500 });
  }
}
