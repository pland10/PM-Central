import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-gate";
import { normalizeCategoryName } from "@/lib/transaction-categories";
import {
  addCategory,
  deleteCategory,
  isCategoryListOpen,
  listCategoryUsage,
  setCategoryListOpen,
} from "@/lib/transaction-categories-db";

// Manage the Transactions category list (Admin → Transaction categories).
// Admin only. Merging lives in ./merge.
export const dynamic = "force-dynamic";

const fail = (e: unknown) =>
  NextResponse.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 502 });

export async function GET() {
  const gate = await requireAdminUser();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    const [categories, open] = await Promise.all([listCategoryUsage(), isCategoryListOpen()]);
    return NextResponse.json({ categories, open });
  } catch (e) {
    return fail(e);
  }
}

// Add a category.
export async function POST(req: NextRequest) {
  const gate = await requireAdminUser();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const name = normalizeCategoryName((await req.json().catch(() => null))?.name);
  if (!name) return NextResponse.json({ error: "Enter a category name." }, { status: 400 });
  try {
    await addCategory(name, gate.user.email ?? "admin");
    return NextResponse.json({ ok: true, name }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

// Open or lock the list: { open: boolean }.
export async function PATCH(req: NextRequest) {
  const gate = await requireAdminUser();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const open = (await req.json().catch(() => null))?.open;
  if (typeof open !== "boolean") return NextResponse.json({ error: "Send open: true|false." }, { status: 400 });
  try {
    await setCategoryListOpen(open);
    return NextResponse.json({ ok: true, open });
  } catch (e) {
    return fail(e);
  }
}

// Delete an unused category (?name=). Used ones must be merged instead.
export async function DELETE(req: NextRequest) {
  const gate = await requireAdminUser();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const name = normalizeCategoryName(req.nextUrl.searchParams.get("name"));
  if (!name) return NextResponse.json({ error: "Missing name." }, { status: 400 });
  try {
    const usage = await listCategoryUsage();
    const hit = usage.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (hit && hit.count > 0) {
      return NextResponse.json({ error: `“${hit.name}” is used by ${hit.count} transactions — merge it instead.` }, { status: 409 });
    }
    await deleteCategory(name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
