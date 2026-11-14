// A work order just created from PM-Central that LeadSimple doesn't have yet
// (WorkOrderRow.pending; src/lib/created-work-orders.ts).
export function SyncingBadge() {
  return (
    <span
      className="whitespace-nowrap rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700"
      title="Just created in PM-Central — shows here now; LeadSimple's copy replaces it after the next sync (notes and tech carry over)."
    >
      Syncing
    </span>
  );
}
