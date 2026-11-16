import { hasCategory } from "@/lib/notification-prefs-db";
import { sendPushToUser } from "@/lib/push-send";
import type { StaffMember } from "@/lib/work-order-notes";

// Phase 3 "updated" trigger (event-driven half): when a note is added to a work
// order that has an in-house tech, push that tech — if they opted into
// "wo_assigned", and they didn't write the note themselves. Best-effort: never
// throws, so a push failure can't break saving the note. (Stage-change updates
// are handled by the push-alerts cron.)

export async function notifyWorkOrderNote(opts: {
  tech: StaffMember;
  woId: string;
  woNumber?: string | null;
  byEmail: string | null;
  body: string;
}): Promise<{ notified: boolean }> {
  try {
    const email = opts.tech.email?.trim().toLowerCase();
    if (!email) return { notified: false };
    if (opts.byEmail && opts.byEmail.trim().toLowerCase() === email) return { notified: false }; // own note

    if (!(await hasCategory(email, "wo_assigned"))) return { notified: false };

    const label = opts.woNumber && opts.woNumber !== "—" ? `#${opts.woNumber}` : "your work order";
    const snippet = opts.body.trim().replace(/\s+/g, " ").slice(0, 100);
    await sendPushToUser(null, email, {
      title: "New note on your work order",
      body: `${label}: ${snippet}`,
      url: "/maintenance",
      tag: `wonote:${opts.woId}`,
    });
    return { notified: true };
  } catch (e) {
    console.error("[notify] wo note failed:", e);
    return { notified: false };
  }
}
