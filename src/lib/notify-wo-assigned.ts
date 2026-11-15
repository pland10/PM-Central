import { hasCategory } from "@/lib/notification-prefs-db";
import { sendPushToUser } from "@/lib/push-send";
import type { StaffMember } from "@/lib/work-order-notes";

// Phase 3 event trigger: when an in-house tech is assigned a work order, push a
// notification to that tech — but only if they opted into "wo_assigned", the
// assignment actually changed, and they didn't assign it to themselves.
// Best-effort: never throws, so a push failure can't break the assignment save.

export async function notifyWorkOrderAssigned(opts: {
  tech: StaffMember;
  woId: string;
  woNumber?: string | null;
  byEmail: string | null;
  previousTechEmail: string | null;
}): Promise<{ notified: boolean }> {
  try {
    const email = opts.tech.email?.trim().toLowerCase();
    if (!email) return { notified: false };

    const prev = opts.previousTechEmail?.trim().toLowerCase() ?? null;
    if (prev === email) return { notified: false }; // unchanged

    const by = opts.byEmail?.trim().toLowerCase() ?? null;
    if (by && by === email) return { notified: false }; // self-assigned

    if (!(await hasCategory(email, "wo_assigned"))) return { notified: false };

    const label = opts.woNumber ? `Work order #${opts.woNumber}` : "A work order";
    await sendPushToUser(null, email, {
      title: "New work order assigned to you",
      body: `${label} is now assigned to you.`,
      url: "/maintenance",
      tag: `wo_assigned:${opts.woId}`,
    });
    return { notified: true };
  } catch (e) {
    console.error("[notify] wo_assigned failed:", e);
    return { notified: false };
  }
}
