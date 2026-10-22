import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public liveness/readiness probe (allowed through middleware in src/middleware.ts).
// Confirms the app is serving and the database is reachable — nothing sensitive
// is exposed. Handy for uptime monitors and for verifying a deploy without
// logging in. Returns 200 when healthy, 503 when the database is unreachable.
export const dynamic = "force-dynamic";

export async function GET() {
  let db: "up" | "down" = "down";
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "up";
  } catch {
    db = "down";
  }
  const ok = db === "up";
  return NextResponse.json(
    { ok, db, time: new Date().toISOString() },
    { status: ok ? 200 : 503 }
  );
}
