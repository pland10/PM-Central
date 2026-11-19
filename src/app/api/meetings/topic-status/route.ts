import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isTopicStatus } from "@/lib/meetings";
import { setTopicStatus } from "@/lib/meeting-topics-db";

// Set a strategic-meeting topic's status: { topicId, status } where status is
// one of open | in_progress | done. Any signed-in user.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => null);
  const topicId = Number(b?.topicId);
  const status = b?.status;
  if (!Number.isInteger(topicId) || topicId <= 0 || !isTopicStatus(status)) {
    return NextResponse.json({ error: "Need a topic and a valid status." }, { status: 400 });
  }

  try {
    await setTopicStatus(topicId, status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[meetings] set topic status failed:", e);
    return NextResponse.json({ error: "Could not save the status." }, { status: 500 });
  }
}
