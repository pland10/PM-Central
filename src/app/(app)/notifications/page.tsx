import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { PushSettings } from "./PushSettings";

// Notifications settings. Phase 1: enable push on this device + a test. Per-type
// preferences and event triggers come next.
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Notifications</h1>
        <p className="mt-1 text-sm text-slate-500">
          Push notifications to your phone or computer. Enable them on each device you want alerts on. Choosing which
          events notify you is coming next.
        </p>
      </div>
      <PushSettings />
    </div>
  );
}
