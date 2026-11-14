import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { getVapidPublicKey } from "@/lib/push-db";

// The app's VAPID public key, for the browser to subscribe with. Not secret,
// but gated to signed-in users like everything else.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ key: await getVapidPublicKey() });
  } catch {
    return NextResponse.json({ error: "Push not available." }, { status: 503 });
  }
}
