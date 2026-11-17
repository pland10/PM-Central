import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { setTaskStatus } from "@/lib/calendar/db";
import { calendarOff, notFound } from "@/lib/calendar/api";

// Check a calendar task off for a month (or un-check it): { eventId, period
// "YYYY-MM", done }. Any signed-in user; recorded under their name.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (calendarOff()) return notFound();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { eventId?: unknown; period?: unknown; done?: unknown } | null;
  const eventId = Number(b?.eventId);
  const period = typeof b?.period === "string" ? b.period : "";
  if (!Number.isInteger(eventId) || eventId <= 0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    return NextResponse.json({ error: "Missing event or month." }, { status: 400 });
  }
  const email = user.email ?? "operator";
  try {
    const r = await setTaskStatus(prisma, eventId, period, b?.done === true, email, user.name || email);
    if (!r.ok) return NextResponse.json({ error: "That event no longer exists." }, { status: 404 });
    return NextResponse.json({ ok: true, status: r.status });
  } catch (e) {
    console.error("[calendar] check-off failed:", e);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}
