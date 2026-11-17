import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/admin-gate";
import { deleteCalendarEvent, updateCalendarEvent } from "@/lib/calendar/db";
import { calendarOff, notFound, readEvent } from "@/lib/calendar/api";

// Edit or delete a close-calendar event. Admin only.
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const idOf = async (ctx: Ctx) => {
  const n = Number((await ctx.params).id);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (calendarOff()) return notFound();
  const gate = await requireAdminUser();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const id = await idOf(ctx);
  if (!id) return NextResponse.json({ error: "Bad event id." }, { status: 400 });
  const read = await readEvent(await req.json().catch(() => null));
  if (!read.ok) return read.response;
  try {
    const event = await updateCalendarEvent(prisma, id, read.value);
    if (!event) return NextResponse.json({ error: "That event no longer exists." }, { status: 404 });
    return NextResponse.json({ event });
  } catch (e) {
    console.error("[calendar] update failed:", e);
    return NextResponse.json({ error: "Could not save the event." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  if (calendarOff()) return notFound();
  const gate = await requireAdminUser();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const id = await idOf(ctx);
  if (!id) return NextResponse.json({ error: "Bad event id." }, { status: 400 });
  try {
    await deleteCalendarEvent(prisma, id);
    return NextResponse.json({ ok: true }); // idempotent: already gone is fine
  } catch (e) {
    console.error("[calendar] delete failed:", e);
    return NextResponse.json({ error: "Could not delete the event." }, { status: 500 });
  }
}
