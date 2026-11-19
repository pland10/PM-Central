import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { savePropertyOrder } from "@/lib/meetings-db";

// Save the admin's custom property sequence for the tactical meeting sheet:
// { ids: string[] } in the order they should appear. Admin only.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const b = await req.json().catch(() => null);
  const ids = b?.ids;
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string" && x)) {
    return NextResponse.json({ error: "Expected a list of property ids." }, { status: 400 });
  }

  try {
    await savePropertyOrder(ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[property-order] save failed:", e);
    return NextResponse.json({ error: "Could not save the order." }, { status: 502 });
  }
}
