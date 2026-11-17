import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/admin-gate";
import { getDigestRecipients, setDigestRecipients } from "@/lib/calendar/db";
import { parseRecipients } from "@/lib/calendar/daily-summary";
import { calendarOff, notFound } from "@/lib/calendar/api";

// Calendar settings: who gets the daily summary email. Admin only.
export const dynamic = "force-dynamic";

export async function GET() {
  if (calendarOff()) return notFound();
  const gate = await requireAdminUser();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    return NextResponse.json({ digestTo: await getDigestRecipients(prisma) });
  } catch (e) {
    console.error("[calendar] settings read failed:", e);
    return NextResponse.json({ error: "Could not load the settings." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (calendarOff()) return notFound();
  const gate = await requireAdminUser();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const parsed = parseRecipients((await req.json().catch(() => null))?.digestTo);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    await setDigestRecipients(prisma, parsed.emails);
    return NextResponse.json({ ok: true, digestTo: parsed.emails });
  } catch (e) {
    console.error("[calendar] settings save failed:", e);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}
