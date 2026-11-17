import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/admin-gate";
import { createCalendarEvent } from "@/lib/calendar/db";
import { calendarOff, notFound, readEvent } from "@/lib/calendar/api";

// Add a close-calendar event. Admin only.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (calendarOff()) return notFound();
  const gate = await requireAdminUser();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const read = await readEvent(await req.json().catch(() => null));
  if (!read.ok) return read.response;
  try {
    const event = await createCalendarEvent(prisma, read.value, gate.user.email ?? "admin");
    return NextResponse.json({ event }, { status: 201 });
  } catch (e) {
    console.error("[calendar] create failed:", e);
    return NextResponse.json({ error: "Could not save the event." }, { status: 500 });
  }
}
