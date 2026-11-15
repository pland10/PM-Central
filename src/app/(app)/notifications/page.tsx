import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { categoriesForRole } from "@/lib/notification-categories";
import { getEnabledCategories } from "@/lib/notification-prefs-db";
import { PushSettings } from "./PushSettings";
import { NotificationPrefs } from "./NotificationPrefs";

// Notifications settings: enable push on each device + choose which events
// notify you. Event triggers (Phase 3) come next.
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) notFound();

  const categories = categoriesForRole(user.role === "admin");
  const enabled = user.email ? await getEnabledCategories(user.email).catch(() => [] as string[]) : [];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Notifications</h1>
        <p className="mt-1 text-sm text-slate-500">
          Push notifications to your phone or computer. Enable them on each device you want alerts on, then choose which
          events notify you.
        </p>
      </div>
      <PushSettings />
      <NotificationPrefs categories={categories} initialEnabled={enabled} />
    </div>
  );
}
