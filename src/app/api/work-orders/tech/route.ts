import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { listStaff } from "@/lib/staff";
import { setTech } from "@/lib/work-order-tech-db";

// Assign (or clear) the in-house tech on a work order: { woId, techEmail|null }.
// Any signed-in user; the tech must be a PM-Central user. No notification.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => null);
  const woId = typeof b?.woId === "string" ? b.woId : "";
  if (!woId) return NextResponse.json({ error: "Missing woId." }, { status: 400 });
  const email = typeof b?.techEmail === "string" ? b.techEmail.trim().toLowerCase() : "";

  let tech = null;
  if (email) {
    tech = (await listStaff()).find((s) => s.email.toLowerCase() === email) ?? null;
    if (!tech) return NextResponse.json({ error: "Pick someone who uses PM-Central." }, { status: 400 });
  }

  try {
    const [found] = await prisma.$queryRaw<{ n: number }[]>(
      Prisma.sql`SELECT COUNT(*)::int AS n FROM work_orders WHERE source_id = ${woId}`
    );
    if (!found?.n) return NextResponse.json({ error: "Work order not found." }, { status: 404 });
    await setTech(woId, tech, user.email ?? "operator");
    return NextResponse.json({ ok: true, tech });
  } catch (e) {
    console.error("[wo-tech] save failed:", e);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}
