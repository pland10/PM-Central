import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isMeetingDate } from "@/lib/meetings";
import { addTopic, deleteTopic, renameTopic } from "@/lib/meeting-topics-db";

// Manage the strategic-meeting Topics within a section (Admin → Meeting topics).
// Admin only.
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized", status: 401 as const };
  if (user.role !== "admin") return { error: "Admins only", status: 403 as const };
  return { user };
}

const title = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");
const idOf = (v: unknown) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
// Every change is for a meeting date and applies from that week on.
const NO_DATE = () => NextResponse.json({ error: "Pick the meeting date this change is for." }, { status: 400 });
const fail = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 502 });

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const b = await req.json().catch(() => null);
  const sectionId = idOf(b?.sectionId);
  const t = title(b?.title);
  if (!sectionId || !t) return NextResponse.json({ error: "Need a section and a topic name." }, { status: 400 });
  if (!isMeetingDate(b?.date)) return NO_DATE();
  try {
    const id = await addTopic(sectionId, t, b.date);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const b = await req.json().catch(() => null);
  const id = idOf(b?.id);
  const t = title(b?.title);
  if (!id || !t) return NextResponse.json({ error: "Need a topic and a name." }, { status: 400 });
  if (!isMeetingDate(b?.date)) return NO_DATE();
  try {
    await renameTopic(id, t, b.date);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const id = idOf(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const date = req.nextUrl.searchParams.get("date");
  if (!isMeetingDate(date)) return NO_DATE();
  try {
    await deleteTopic(id, date);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
