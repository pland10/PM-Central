import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { applyTenantTurnerEvent } from "@/lib/showings";

// Tenant Turner webhook receiver. Tenant Turner POSTs a viewing/lockbox event
// here; we upsert it into the Showing table. See src/lib/showings.ts.
//
// Auth: Tenant Turner webhooks are NOT cryptographically signed, so we gate on
// a shared secret carried in the URL you register in the Tenant Turner portal:
//
//   https://pmilighthouse.app/api/webhooks/tenantturner?key=<TENANT_TURNER_WEBHOOK_SECRET>
//
// (or an Authorization: Bearer <secret> header). The secret lives in the
// TENANT_TURNER_WEBHOOK_SECRET env var on each Railway service. Not configured
// => locked down. The middleware lets /api/webhooks/ through the login gate.
//
// Runs on the Node runtime for crypto; dynamic so it never caches.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const secret = process.env.TENANT_TURNER_WEBHOOK_SECRET;
  if (!secret) return false; // not configured => reject everything
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const provided = bearer || req.nextUrl.searchParams.get("key") || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    const result = await applyTenantTurnerEvent(payload);
    // Ack non-showing events with 200 too, so Tenant Turner doesn't retry an
    // event we simply don't track.
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[tenantturner webhook] failed to apply event:", err);
    return NextResponse.json({ error: "Failed to process event." }, { status: 500 });
  }
}

// A plain GET is handy for a quick "is the endpoint live + secret right?" check
// from a browser or the portal's test button. It does not reveal data.
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, endpoint: "tenantturner", ready: true });
}
