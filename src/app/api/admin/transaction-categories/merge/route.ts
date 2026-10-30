import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-gate";
import { normalizeCategoryName } from "@/lib/transaction-categories";
import { mergeCategory } from "@/lib/transaction-categories-db";

// Merge one category into another: every transaction using `from` moves to
// `to`, and `from` leaves the list. Admin only.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const gate = await requireAdminUser();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = await req.json().catch(() => null);
  const from = normalizeCategoryName(body?.from);
  const to = normalizeCategoryName(body?.to);
  if (!from || !to) return NextResponse.json({ error: "Send from and to." }, { status: 400 });
  if (from.toLowerCase() === to.toLowerCase()) {
    return NextResponse.json({ error: "Pick a different category to merge into." }, { status: 400 });
  }
  try {
    await mergeCategory(from, to, gate.user.email ?? "admin");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 502 });
  }
}
