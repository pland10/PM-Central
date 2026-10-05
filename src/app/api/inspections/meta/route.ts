import { NextResponse } from "next/server";
import { getInspectionsDb } from "@/lib/inspections/supabase";
import { getInspectionMetaTables } from "@/lib/inspections/db";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isFeatureEnabled } from "@/config/features";
import type { Inspector } from "@/lib/inspections/types";

// Reference data for the inspection create/edit form: properties, reasons,
// services, special instructions (from the single DB), plus the inspectors
// (the people with login accounts — still Supabase Auth users).
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isFeatureEnabled("inspections")) {
    return NextResponse.json({ error: "Inspections is disabled." }, { status: 404 });
  }
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tables = await getInspectionMetaTables();

  // Inspectors = the login users on the Supabase project (admin API).
  let inspectors: Inspector[] = [];
  const db = getInspectionsDb();
  if (db) {
    try {
      const usersRes = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
      inspectors = (usersRes.data?.users ?? [])
        .map((u) => {
          const m = (u.user_metadata ?? {}) as Record<string, unknown>;
          const name =
            (typeof m.full_name === "string" && m.full_name) ||
            (typeof m.name === "string" && m.name) ||
            u.email ||
            "";
          return { id: u.id, email: u.email ?? null, name };
        })
        .filter((u) => u.name)
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    } catch {
      inspectors = [];
    }
  }

  return NextResponse.json({
    ...tables,
    inspectors,
    me: { id: me.id, name: me.name },
  });
}
