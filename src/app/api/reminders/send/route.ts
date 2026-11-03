import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { bodyToHtml, reminderAddress, renderTemplate, senderFrom } from "@/lib/reminders";
import { fetchRecipients, getReminderTemplate, recordReminders } from "@/lib/reminders-db";

// Send rent reminders to the selected delinquent leases, as the logged-in user
// (Reply-To their address). The server re-derives who/what from the lease ids —
// the client never dictates recipients, amounts or addresses.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_FROM = "PMI Lighthouse <inspections@pmilighthouse.app>";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEmailConfigured()) return NextResponse.json({ error: "Email isn't configured." }, { status: 503 });

  const b = await req.json().catch(() => ({}));
  const rawIds: unknown = (b as { leaseIds?: unknown })?.leaseIds;
  const leaseIds: string[] = Array.isArray(rawIds) ? rawIds.filter((x): x is string => typeof x === "string") : [];
  if (leaseIds.length === 0) return NextResponse.json({ error: "Pick at least one tenant to remind." }, { status: 400 });

  try {
    const [recipients, template] = await Promise.all([fetchRecipients(leaseIds), getReminderTemplate()]);
    if (recipients.length === 0) {
      return NextResponse.json({ error: "None of the selected leases can be reminded (no balance or no email)." }, { status: 400 });
    }

    const address = process.env.RESEND_REMINDERS_FROM || reminderAddress(process.env.RESEND_FROM || DEFAULT_FROM);
    const from = senderFrom(user.name || user.email || "", address);
    const replyTo = user.email ?? undefined;

    const sent: typeof recipients = [];
    const failed: { tenant: string; error: string }[] = [];
    for (const r of recipients) {
      const res = await sendEmail({
        to: r.email,
        subject: renderTemplate(template.subject, r),
        html: bodyToHtml(renderTemplate(template.body, r)),
        from,
        replyTo,
      });
      if (res.ok) sent.push(r);
      else failed.push({ tenant: r.tenant, error: res.error ?? "send failed" });
    }

    if (sent.length > 0) {
      await recordReminders(
        sent.map((r) => ({ leaseId: r.leaseId, tenant: r.tenant, email: r.email, amount: r.amount })),
        user.email ?? ""
      );
    }

    const requested = new Set(leaseIds);
    const reachable = new Set(recipients.map((r) => r.leaseId));
    const skipped = [...requested].filter((id) => !reachable.has(id)).length;
    return NextResponse.json({ sent: sent.length, failed, skipped });
  } catch (e) {
    console.error("[reminders] send failed:", e);
    return NextResponse.json({ error: "Could not send the reminders." }, { status: 500 });
  }
}
