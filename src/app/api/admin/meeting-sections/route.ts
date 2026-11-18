import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { addSection, deleteSection, renameSection } from "@/lib/meeting-topics-db";

// Manage the strategic-meeting Sections (Admin → Meeting topics). Admin only.
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized", status: 401 as const };
  if (user.role !== "admin") return { error: "Admins only", status: 403 as const };
  return { user };
}

const title = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");
const idOf = (v: unknown) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const fail = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 502 });

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const b = await req.json().catch(() => null);
  const t = title(b?.title);
  if (!t) return NextResponse.json({ error: "Enter a section name." }, { status: 400 });
  try {
    const id = await addSection(t);
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
  if (!id || !t) return NextResponse.json({ error: "Need a section and a name." }, { status: 400 });
  try {
    await renameSection(id, t);
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
  try {
    await deleteSection(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
