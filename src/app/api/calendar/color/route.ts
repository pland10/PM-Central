import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { listStaff } from "@/lib/staff";
import { setUserColor } from "@/lib/calendar/colors-db";
import { isCalendarColor } from "@/lib/calendar/colors";
import { calendarOff, notFound } from "@/lib/calendar/api";

// Set a calendar color: { color } from the set in src/lib/calendar/colors.ts.
// Anyone can set their own; an admin can also set someone else's ({ color,
// email }). Someone holding the color only automatically is moved to the next
// free one (returned as `moved`); 409 if someone chose it themselves.
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  if (calendarOff()) return notFound();
  const user = await getCurrentUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { color?: unknown; email?: unknown } | null;
  const color = b?.color;
  if (!isCalendarColor(color)) return NextResponse.json({ error: "Pick one of the calendar colors." }, { status: 400 });
  const me = user.email.toLowerCase();
  const target = typeof b?.email === "string" && b.email.trim() ? b.email.trim().toLowerCase() : me;
  const staff = target !== me ? await listStaff().catch(() => []) : [];
  if (target !== me) {
    if (user.role !== "admin") return NextResponse.json({ error: "Only admins can set someone else's color." }, { status: 403 });
    if (!staff.some((s) => s.email.toLowerCase() === target)) {
      return NextResponse.json({ error: "Pick someone who uses PM Central." }, { status: 400 });
    }
  }
  try {
    const r = await setUserColor(prisma, target, color);
    if (!r.ok) {
      const people = staff.length ? staff : await listStaff().catch(() => []);
      const name = r.takenBy ? people.find((s) => s.email.toLowerCase() === r.takenBy)?.name ?? r.takenBy : null;
      return NextResponse.json({ error: name ? `That color is taken by ${name}.` : "Someone just took that color — pick another." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, email: target, color, ...(r.moved ? { moved: r.moved } : {}) });
  } catch (e) {
    console.error("[calendar] color save failed:", e);
    return NextResponse.json({ error: "Could not save your color." }, { status: 500 });
  }
}
