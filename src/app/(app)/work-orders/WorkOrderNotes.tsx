"use client";

import type { WorkOrderNote } from "@/lib/work-order-notes";
import { NotesPanel } from "@/components/NotesPanel";

// Notes thread for one work order (opened from the Work Orders list /
// Maintenance). "Email to" defaults to the work order's assignee, if they use
// PM-Central. The panel itself is shared (src/components/NotesPanel.tsx).
export function WorkOrderNotes({
  wo,
  onClose,
  onAdded,
  onChanged,
}: {
  wo: { id: string; number: string; issue: string };
  onClose: () => void;
  onAdded?: (note: WorkOrderNote, count: number) => void;
  onChanged?: (latest: WorkOrderNote | null, count: number) => void;
}) {
  return (
    <NotesPanel
      api="/api/work-orders/notes"
      listQuery={`wo=${encodeURIComponent(wo.id)}`}
      postKey={{ woId: wo.id }}
      heading={`Notes · WO #${wo.number}`}
      title={wo.issue}
      placeholder="e.g. Owner approved — go ahead with the repair"
      dialogLabel={`Notes for WO #${wo.number}`}
      onClose={onClose}
      onAdded={onAdded}
      onChanged={onChanged}
    />
  );
}
