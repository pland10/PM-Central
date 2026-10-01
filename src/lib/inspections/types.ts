// Shapes for the Inspections module, mirroring the pmi_inspect_* tables. Pure
// (no server deps) so client components can import the types + helpers.

export type InspectionRow = {
  id: number;
  property_id: number | null;
  inspection_reason: string | null;
  inspector_name: string | null;
  inspection_date: string | null;
  inspection_time: string | null;
  notes: string | null;
  overall_status: string | null;
  special_instructions: string | null;
  created_by_user_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  // joined / derived for the list view
  property_name?: string;
  property_address?: string;
  photo_count?: number;
};

export type InspectionProperty = {
  id: number;
  name: string | null;
  address: string | null;
};

export type InspectionPhoto = {
  id: number;
  inspection_id: number;
  filename: string | null;
  original_name: string | null;
  url: string | null;
};

export type ChecklistItem = {
  id: number;
  inspection_id: number;
  item_key: string | null;
  item_label: string | null;
  checked: number | boolean | null;
  status: string | null;
  issue_notes: string | null;
};

export type WorkItem = {
  id: number;
  inspection_id: number;
  service_name: string | null;
  quantity: number | null;
  notes: string | null;
};

export type InspectionDetail = InspectionRow & {
  checklist: ChecklistItem[];
  photos: InspectionPhoto[];
  work_items: WorkItem[];
};

// Normalize the free-form overall_status into a small set for badge coloring.
export function statusTone(status: string | null | undefined): "good" | "warn" | "bad" | "neutral" {
  const s = (status || "").toLowerCase();
  if (/(pass|complete|good|ok|satisfactor)/.test(s)) return "good";
  if (/(attention|follow|minor|watch|pending|schedul)/.test(s)) return "warn";
  if (/(fail|issue|problem|poor|urgent|major)/.test(s)) return "bad";
  return "neutral";
}

export function formatInspectionDate(d: string | null | undefined): string {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
