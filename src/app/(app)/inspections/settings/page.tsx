import Link from "next/link";
import { requireFeature } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { InstructionsManager } from "./InstructionsManager";

export const dynamic = "force-dynamic";

export default async function InspectionSettingsPage() {
  requireFeature("inspections");
  const user = await getCurrentUser();
  const isAdmin = user?.role === "admin";

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/inspections" className="text-sm text-slate-500 hover:text-brand-600">
        ← All inspections
      </Link>
      <h1 className="mb-1 mt-2 text-lg font-semibold text-ink">Special instructions</h1>
      <p className="mb-4 text-sm text-slate-500">
        Define instructions (e.g. “Water plants”, “Start car”) and choose which houses each one
        applies to. Assigned instructions show up on an inspection when that property is selected.
      </p>

      {isAdmin ? (
        <InstructionsManager />
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Managing special instructions is limited to admins. Ask an admin to grant your account
          the <code className="rounded bg-amber-100 px-1">can_edit_all</code> role in Supabase.
        </div>
      )}
    </div>
  );
}
