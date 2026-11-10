import { formatEasternTimestamp } from "@/lib/format";

// "Last refreshed Nov 10, 9:05 AM EST · 55m ago" for a screen's data, from a
// sync heartbeat. Shows the stuck message instead when the sync is stuck, and
// nothing when there's no timestamp. `now` is injectable for tests.
export function FreshnessBadge({
  updatedAt,
  stuck,
  detail,
  now = Date.now(),
}: {
  updatedAt?: string | null;
  stuck?: boolean;
  detail?: string;
  now?: number;
}) {
  if (!updatedAt) return null;
  const at = new Date(updatedAt);
  if (Number.isNaN(at.getTime())) return null;
  const color = stuck ? "text-red-600" : "text-emerald-700";
  return (
    <div className={`shrink-0 text-xs font-medium ${color}`} title={detail || ""}>
      ● {stuck ? detail || "sync stuck" : `Last refreshed ${formatEasternTimestamp(at)} · ${timeAgo(at.getTime(), now)}`}
    </div>
  );
}

function timeAgo(t: number, now: number): string {
  const mins = Math.floor((now - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
