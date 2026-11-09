import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { listPreventivePatternsSafe } from "@/lib/preventive-patterns-db";
import { PreventivePatternsManager } from "./PreventivePatternsManager";

// Admin → Preventive maintenance: keyword rules that mark a work order as
// preventive (routine) so it's kept off the Maintenance "Needs attention" list.
export const dynamic = "force-dynamic";

export default async function PreventiveMaintenancePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") notFound();
  const patterns = await listPreventivePatternsSafe();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Preventive maintenance</h1>
        <p className="mt-1 text-sm text-slate-500">
          A work order is treated as <strong>preventive</strong> (routine/scheduled) — and kept off the{" "}
          <Link href="/maintenance" className="font-medium text-brand-600 hover:underline">
            Maintenance
          </Link>{" "}
          “Needs attention” list — when it comes from a Rentvine <em>recurring</em> work order, or when its
          title contains one of the keywords below. Matching is anywhere in the title and not
          case-sensitive. Removing a keyword brings its work orders back onto the attention list.
        </p>
        <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Built-in rules (always on): <strong>tune-up</strong> / <strong>tuneup</strong> (e.g. HVAC tune-ups) and{" "}
          <strong>sprinkler winterization</strong>. The keywords below are added on top of these.
        </p>
      </div>
      <PreventivePatternsManager initialPatterns={patterns} />
    </div>
  );
}
