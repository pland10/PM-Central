import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { normalizeComment, normalizeHidePattern } from "@/lib/transaction-filters";
import {
  addHideRule,
  deleteHideRule,
  listHideRules,
  updateHideRuleComment,
} from "@/lib/transaction-filters-db";

// Manage the Transactions hide filters (Admin → Transaction filters). Admin only.
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized", status: 401 as const };
  if (user.role !== "admin") return { error: "Admins only", status: 403 as const };
  return { user };
}

const fail = (e: unknown) =>
  NextResponse.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 502 });

function idParam(req: NextRequest): number | null {
  const id = Number(req.nextUrl.searchParams.get("id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    return NextResponse.json({ rules: await listHideRules() });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => null);
  const pattern = normalizeHidePattern(body?.pattern);
  if (!pattern) return NextResponse.json({ error: "Enter a pattern (not just *)." }, { status: 400 });
  const comment = normalizeComment(body?.comment);
  if (!comment) return NextResponse.json({ error: "A comment is required." }, { status: 400 });

  try {
    await addHideRule(pattern, comment, gate.user.email ?? "admin");
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const id = idParam(req);
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const comment = normalizeComment((await req.json().catch(() => null))?.comment);
  if (!comment) return NextResponse.json({ error: "A comment is required." }, { status: 400 });
  try {
    await updateHideRuleComment(id, comment);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const id = idParam(req);
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  try {
    await deleteHideRule(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
