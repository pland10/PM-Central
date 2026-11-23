import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isMeetingDate } from "@/lib/meetings";
import { setWoNeeded } from "@/lib/meetings-db";

// Tick / untick "work order needed" for one house on a meeting date:
// { propertyId, date (YYYY-MM-DD), needed: boolean }. Any signed-in user.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => null);
  const propertyId = typeof b?.propertyId === "string" ? b.propertyId.trim() : "";
  const date = b?.date;
  if (!propertyId || !isMeetingDate(date) || typeof b?.needed !== "boolean") {
    return NextResponse.json({ error: "Need a property, a valid meeting date and needed: true/false." }, { status: 400 });
  }

  try {
    await setWoNeeded(propertyId, date, b.needed);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[meetings] save work-order flag failed:", e);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}
