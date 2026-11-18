import { getCurrentUser } from "@/lib/auth/supabase-server";
import { requireFeature } from "@/config/features";
import { isMeetingDate, nestTopics, recentMeetingTuesdays, tuesdayOf } from "@/lib/meetings";
import { listStructureSafe, topicNotesForDate, topicPreviousNotes } from "@/lib/meeting-topics-db";
import { MeetingTabs } from "../MeetingTabs";
import { StrategicSheet, type StrategicSection } from "./StrategicSheet";

// Tuesday strategic meeting: walk the admin-managed agenda (sections → topics),
// taking a dated note on each topic. Date defaults to this week's Tuesday.
export const dynamic = "force-dynamic";

export default async function StrategicMeetingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  requireFeature("meetings");
  const user = await getCurrentUser();
  const { date: raw } = await searchParams;
  const date = isMeetingDate(raw) ? raw : tuesdayOf(new Date());

  const [{ sections, topics }, notes, prior] = await Promise.all([
    listStructureSafe(),
    topicNotesForDate(date).catch(() => ({}) as Record<number, string>),
    topicPreviousNotes(date).catch(() => ({}) as Record<number, { date: string; body: string }>),
  ]);

  const nested: StrategicSection[] = nestTopics(sections, topics).map((s) => ({
    id: s.id,
    title: s.title,
    topics: s.topics.map((t) => ({ id: t.id, title: t.title, note: notes[t.id] ?? "", lastNote: prior[t.id] ?? null })),
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <MeetingTabs active="strategic" />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Tuesday strategic meeting</h1>
        <p className="mt-1 text-sm text-slate-500">
          Walk the agenda, section by section, and capture where each topic stands. Notes are saved per meeting date.
        </p>
      </div>
      <StrategicSheet
        date={date}
        dateOptions={recentMeetingTuesdays(new Date(), 8)}
        sections={nested}
        canManage={user?.role === "admin"}
      />
    </div>
  );
}
