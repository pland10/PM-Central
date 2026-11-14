import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { sendPushToUser } from "@/lib/push-send";

// Send a test notification to the signed-in user's devices.
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sent, pruned } = await sendPushToUser(user.id, user.email, {
    title: "PM Central",
    body: "✅ Test notification — push is working on this device.",
    url: "/notifications",
    tag: "pmc-test",
  });

  if (sent === 0) {
    return NextResponse.json(
      { ok: false, sent, error: 'No active device found. Tap "Enable on this device" first.' },
      { status: 200 }
    );
  }
  return NextResponse.json({ ok: true, sent, pruned });
}
