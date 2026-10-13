import { requireFeature } from "@/config/features";
import { listShowings } from "@/lib/showings";
import { ShowingsTable } from "./ShowingsTable";

export const dynamic = "force-dynamic";

export default async function ShowingsPage() {
  requireFeature("showings");
  const rows = await listShowings();

  if (!rows) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Showings</h1>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
          The showings table hasn&apos;t been set up yet.
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Showings</h1>
          <p className="mt-1 text-sm text-slate-500">Property viewings from Tenant Turner.</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
          No showings yet. Once the Tenant Turner webhook is connected, viewings will appear here as
          they&apos;re scheduled.
        </div>
      </div>
    );
  }

  const now = Date.now();
  const upcoming = rows.filter(
    (r) =>
      r.startTime &&
      new Date(r.startTime).getTime() >= now &&
      !["cancelled", "no-show", "completed"].includes(r.status)
  ).length;
  const needsAction = rows.filter((r) => r.status === "requested").length;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Showings</h1>
        <p className="mt-1 text-sm text-slate-500">
          {upcoming} upcoming
          {needsAction > 0 ? ` · ${needsAction} requested` : ""} · {rows.length} total · property
          viewings from Tenant Turner.
        </p>
      </div>

      <ShowingsTable rows={rows} />
    </div>
  );
}
