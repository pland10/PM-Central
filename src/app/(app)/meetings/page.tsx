import { prisma } from "@/lib/prisma";
import { formatAddress } from "@/lib/format";
import { requireFeature } from "@/config/features";
import { isMeetingDate, mondayOf, recentMeetingMondays, splitMeetingGroups } from "@/lib/meetings";
import { notesForDate, previousNotes, removedPropertyIds } from "@/lib/meetings-db";
import { MeetingSheet, type MeetingRow } from "./MeetingSheet";

// Monday tactical meeting: walk every house (Rental Units, then Squatter Watch),
// take a dated note on each. Date defaults to this week's Monday; ?date= picks a
// past meeting. See src/lib/meetings.ts.
export const dynamic = "force-dynamic";

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  requireFeature("meetings");
  const { date: raw } = await searchParams;
  const date = isMeetingDate(raw) ? raw : mondayOf(new Date());

  const [properties, removed, notes, prior] = await Promise.all([
    prisma.property.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, street1: true, street2: true, city: true, state: true, zip: true, status: true, tags: true },
    }),
    removedPropertyIds().catch(() => new Set<string>()),
    notesForDate(date).catch(() => ({}) as Record<string, string>),
    previousNotes(date).catch(() => ({}) as Record<string, { date: string; body: string }>),
  ]);

  const toRow = (p: (typeof properties)[number]): MeetingRow => {
    const label = p.name || p.street1;
    return {
      id: p.id,
      label,
      address: formatAddress(p),
      active: p.status === "active",
      tags: p.tags,
      sortKey: label,
      note: notes[p.id] ?? "",
      lastNote: prior[p.id] ?? null,
    };
  };

  const onSheet = properties.filter((p) => !removed.has(p.id)).map(toRow);
  const { rentals, squatterWatch } = splitMeetingGroups(onSheet);
  const removedRows = properties
    .filter((p) => removed.has(p.id))
    .map(toRow)
    .sort((a, b) => a.sortKey.toLowerCase().localeCompare(b.sortKey.toLowerCase()));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Monday tactical meeting</h1>
        <p className="mt-1 text-sm text-slate-500">
          Walk every house and jot what&apos;s going on. Notes are saved per meeting date, so last week stays with you.
        </p>
      </div>
      <MeetingSheet
        date={date}
        dateOptions={recentMeetingMondays(new Date(), 8)}
        rentals={rentals}
        squatterWatch={squatterWatch}
        removed={removedRows}
      />
    </div>
  );
}
