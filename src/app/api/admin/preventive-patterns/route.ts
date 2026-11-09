import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { normalizePreventivePattern } from "@/lib/preventive";
import {
  addPreventivePattern,
  deletePreventivePattern,
  listPreventivePatterns,
} from "@/lib/preventive-patterns-db";

// Manage the preventive-maintenance keyword rules (Admin → Preventive
// maintenance). Admin only.
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

function normalizeNote(input: unknown): string {
  return typeof input === "string" ? input.trim().slice(0, 500) : "";
}

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    return NextResponse.json({ patterns: await listPreventivePatterns() });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => null);
  const pattern = normalizePreventivePattern(body?.pattern);
  if (!pattern) return NextResponse.json({ error: "Enter a keyword." }, { status: 400 });

  try {
    await addPreventivePattern(pattern, normalizeNote(body?.note), gate.user.email ?? "admin");
    return NextResponse.json({ ok: true }, { status: 201 });
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
    await deletePreventivePattern(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
