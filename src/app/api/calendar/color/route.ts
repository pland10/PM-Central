import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { listStaff } from "@/lib/staff";
import { setUserColor } from "@/lib/calendar/colors-db";
import { isCalendarColor } from "@/lib/calendar/colors";
import { calendarOff, notFound } from "@/lib/calendar/api";

// Pick your own calendar color: { color } from the set in src/lib/calendar/colors.ts.
// Any signed-in user, for themselves only; 409 if someone else has it.
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  if (calendarOff()) return notFound();
  const user = await getCurrentUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const color = (await req.json().catch(() => null))?.color;
  if (!isCalendarColor(color)) return NextResponse.json({ error: "Pick one of the calendar colors." }, { status: 400 });
  try {
    const r = await setUserColor(prisma, user.email, color);
    if (!r.ok) {
      const name = r.takenBy ? (await listStaff().catch(() => [])).find((s) => s.email.toLowerCase() === r.takenBy)?.name ?? r.takenBy : null;
      return NextResponse.json({ error: name ? `That color is taken by ${name}.` : "Someone just took that color — pick another." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, email: user.email.toLowerCase(), color });
  } catch (e) {
    console.error("[calendar] color save failed:", e);
    return NextResponse.json({ error: "Could not save your color." }, { status: 500 });
  }
}
