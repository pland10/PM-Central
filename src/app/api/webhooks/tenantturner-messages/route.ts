import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { parseTtMessageEmail } from "@/lib/tenantturner/messages";
import { saveTtMessages, type TtMessageInput } from "@/lib/tenantturner/messages-db";

// Receives Tenant Turner "New message from <lead>" notification emails, posted
// by the Google Apps Script in the shared Gmail
// (scripts/apps-script/tenantturner-messages.gs), and stores the lead replies.
//
//   POST { messages: [{ id, date, subject, body }] }   (Gmail message id, ISO date, plain text)
//   Authorization: Bearer <TT_MESSAGES_SECRET>
//
// Unset TT_MESSAGES_SECRET => locked down. The middleware lets /api/webhooks/
// through the login gate. Responds with counts only.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BATCH = 100;

function authorized(req: NextRequest): boolean {
  const secret = process.env.TT_MESSAGES_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { messages?: unknown };
  if (!Array.isArray(body.messages)) return NextResponse.json({ error: "Send { messages: [...] }." }, { status: 400 });

  const batch = body.messages.slice(0, MAX_BATCH);
  const rows: TtMessageInput[] = [];
  for (const m of batch) {
    const o = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
    const id = str(o.id, 200);
    const subject = str(o.subject, 500);
    const text = str(o.body, 50_000);
    const date = new Date(str(o.date, 64) ?? "");
    if (!id || !subject || !text || Number.isNaN(date.getTime())) continue;
    const parsed = parseTtMessageEmail({ subject, body: text });
    if (parsed) rows.push({ gmailId: id, receivedAt: date, ...parsed });
  }

  const stored = await saveTtMessages(prisma, rows);
  return NextResponse.json({ ok: true, received: batch.length, parsed: rows.length, stored });
}
