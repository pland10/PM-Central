import type { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

// Auth for /api/cron/* (which bypass the login gate): Authorization: Bearer
// <CRON_SECRET> — what Vercel Cron sends — or ?key=<CRON_SECRET> for simple
// pingers that can't send headers. Unset CRON_SECRET => locked down.
export function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const provided = bearer || req.nextUrl.searchParams.get("key") || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
