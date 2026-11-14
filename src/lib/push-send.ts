import webpush from "web-push";
import { deleteSubscription, getVapidKeys, listSubscriptions, type StoredSubscription } from "@/lib/push-db";

// Sends Web Push notifications. VAPID details come from the stored keypair
// (push-db). Best-effort: a dead subscription (404/410) is pruned, and the
// function never throws.

const SUBJECT = "mailto:notifications@pmilighthouse.app";

export type PushPayload = { title: string; body?: string; url?: string; tag?: string; icon?: string };

async function configureVapid() {
  const { publicKey, privateKey } = await getVapidKeys();
  webpush.setVapidDetails(SUBJECT, publicKey, privateKey);
}

async function sendOne(sub: StoredSubscription, payload: PushPayload): Promise<"ok" | "gone" | "error"> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return "ok";
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) {
      await deleteSubscription(sub.endpoint).catch(() => {});
      return "gone"; // subscription expired — pruned
    }
    console.error(`[push] send failed (${code ?? "?"}) for ${sub.endpoint.slice(0, 40)}…`);
    return "error";
  }
}

// Push to every device the user has subscribed. Returns how many landed and how
// many expired subscriptions were pruned.
export async function sendPushToUser(
  userId: string | null,
  userEmail: string | null,
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  try {
    await configureVapid();
    const subs = await listSubscriptions(userId, userEmail);
    let sent = 0;
    let pruned = 0;
    await Promise.all(
      subs.map(async (s) => {
        const r = await sendOne(s, payload);
        if (r === "ok") sent++;
        else if (r === "gone") pruned++;
      })
    );
    return { sent, pruned };
  } catch (e) {
    console.error("[push] sendPushToUser failed:", e);
    return { sent: 0, pruned: 0 };
  }
}
