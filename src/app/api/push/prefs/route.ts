import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canUseCategory, categoriesForRole } from "@/lib/notification-categories";
import { getEnabledCategories, setCategory } from "@/lib/notification-prefs-db";

// Read / set the signed-in user's notification category preferences. Admin-only
// categories are enforced here (a non-admin can't enable one).
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !user.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({
      categories: categoriesForRole(user.role === "admin"),
      enabled: await getEnabledCategories(user.email),
    });
  } catch (e) {
    console.error("[push] read prefs failed:", e);
    return NextResponse.json({ error: "Could not load preferences." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const category = typeof body?.category === "string" ? body.category : "";
  const enabled = typeof body?.enabled === "boolean" ? body.enabled : null;
  if (!category || enabled === null) {
    return NextResponse.json({ error: "Send a category and enabled." }, { status: 400 });
  }
  // Unknown category, or an admin-only one for a non-admin.
  if (!canUseCategory(category, user.role === "admin")) {
    return NextResponse.json({ error: "Not an available category." }, { status: 403 });
  }

  try {
    await setCategory(user.email, category, enabled);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[push] set pref failed:", e);
    return NextResponse.json({ error: "Could not save preference." }, { status: 500 });
  }
}
