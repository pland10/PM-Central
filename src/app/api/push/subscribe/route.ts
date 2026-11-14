import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { saveSubscription } from "@/lib/push-db";

// Save this browser/device's push subscription for the signed-in user.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  try {
    await saveSubscription({
      userId: user.id,
      userEmail: user.email,
      endpoint,
      p256dh,
      auth,
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    console.error("[push] subscribe failed:", e);
    return NextResponse.json({ error: "Could not save subscription." }, { status: 500 });
  }
}
