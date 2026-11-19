import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isPropertyActive, setPropertyRemoved } from "@/lib/meetings-db";

// Hide a house from the meeting sheet, or put it back: { propertyId, removed }.
// Only touches the meeting list — never the underlying property. Any signed-in
// user. Active houses can't be removed (only inactive ones you no longer want).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => null);
  const propertyId = typeof b?.propertyId === "string" ? b.propertyId.trim() : "";
  const removed = Boolean(b?.removed);
  if (!propertyId) return NextResponse.json({ error: "Missing property." }, { status: 400 });

  try {
    if (removed && (await isPropertyActive(propertyId))) {
      return NextResponse.json({ error: "Active houses can't be removed from the list." }, { status: 400 });
    }
    await setPropertyRemoved(propertyId, removed);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[meetings] remove/restore failed:", e);
    return NextResponse.json({ error: "Could not update the list." }, { status: 500 });
  }
}
