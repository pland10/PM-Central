import { NextRequest, NextResponse } from "next/server";
import { getInspectionsDb } from "@/lib/inspections/supabase";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";
import type { Inspector } from "@/lib/inspections/types";

// Inspectors = the login users on the inspections Supabase project. GET lists
// them (any signed-in user); PUT renames one (admin only). New inspectors are
// added by inviting them in Supabase Auth, not here.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isFeatureEnabled("inspections")) {
    return NextResponse.json({ error: "Inspections is disabled." }, { status: 404 });
  }
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getInspectionsDb();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const res = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 502 });

  const inspectors: Inspector[] = (res.data?.users ?? [])
    .map((u) => {
      const m = (u.user_metadata ?? {}) as Record<string, unknown>;
      const name =
        (typeof m.full_name === "string" && m.full_name) ||
        (typeof m.name === "string" && m.name) ||
        u.email ||
        "";
      return { id: u.id, email: u.email ?? null, name };
    })
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  return NextResponse.json({ inspectors });
}

export async function PUT(req: NextRequest) {
  if (!isFeatureEnabled("inspections")) {
    return NextResponse.json({ error: "Inspections is disabled." }, { status: 404 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const db = getInspectionsDb();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const id = (body?.id ?? "").toString();
  const name = (body?.name ?? "").toString().trim();
  if (!id || !name) {
    return NextResponse.json({ error: "id and name are required" }, { status: 400 });
  }

  const res = await db.auth.admin.updateUserById(id, { user_metadata: { full_name: name } });
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 502 });

  return NextResponse.json({ ok: true });
}
