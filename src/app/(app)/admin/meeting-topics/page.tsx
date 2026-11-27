import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { isMeetingDate, meetingDateOptions, nestTopics, tuesdayOf } from "@/lib/meetings";
import { listStructureSafe } from "@/lib/meeting-topics-db";
import { MeetingTopicsManager } from "./MeetingTopicsManager";

// Admin → Meeting topics: the Sections and Topics that make up the Tuesday
// strategic meeting agenda (see /meetings/strategic).
export const dynamic = "force-dynamic";

export default async function MeetingTopicsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") notFound();

  // The agenda is per meeting date; default to next week's (the one being planned).
  const { date: raw } = await searchParams;
  const dateOptions = meetingDateOptions(new Date(), 2, 8);
  const date = isMeetingDate(raw) ? raw : dateOptions[0] ?? tuesdayOf(new Date());
  const { sections, topics } = await listStructureSafe(date);
  const nested = nestTopics(sections, topics);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Meeting topics</h1>
        <p className="mt-1 text-sm text-slate-500">
          The agenda for the{" "}
          <Link href="/meetings/strategic" className="font-medium text-brand-600 hover:underline">
            Tuesday strategic meeting
          </Link>
          , week by week: pick the meeting date, then group it into sections and add the topics you walk through under
          each. Rename by editing the box; changes save when you click away. Adds and renames apply to that week and
          the weeks after it; when you remove something you choose &ldquo;only this week&rdquo; or &ldquo;this week
          and after&rdquo;. Earlier meetings keep the agenda and notes they had.
        </p>
      </div>
      {/* key={date} reloads the editor with that week's agenda. */}
      <MeetingTopicsManager key={date} initialSections={nested} date={date} dateOptions={dateOptions} />
    </div>
  );
}
