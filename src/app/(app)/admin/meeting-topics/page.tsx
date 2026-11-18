import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { nestTopics } from "@/lib/meetings";
import { listStructureSafe } from "@/lib/meeting-topics-db";
import { MeetingTopicsManager } from "./MeetingTopicsManager";

// Admin → Meeting topics: the Sections and Topics that make up the Tuesday
// strategic meeting agenda (see /meetings/strategic).
export const dynamic = "force-dynamic";

export default async function MeetingTopicsAdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") notFound();

  const { sections, topics } = await listStructureSafe();
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
          : group it into sections, add the topics you walk through under each. Rename by editing the box; changes
          save when you click away. Deleting a section removes its topics and their notes.
        </p>
      </div>
      <MeetingTopicsManager initialSections={nested} />
    </div>
  );
}
