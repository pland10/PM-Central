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

// The standard checklist that appears on every inspection (ported from the
// original app). Each item is marked OK or "Issue found" during the visit.
export const DEFAULT_CHECKLIST: { key: string; label: string }[] = [
  { key: "exterior", label: "🏠 Exterior Condition" },
  { key: "water", label: "💧 Water / Leaks" },
  { key: "mail", label: "📬 Mail Collected" },
  { key: "security", label: "🔒 Break-in / Security" },
  { key: "hvac", label: "🌡️ HVAC / Utilities" },
];

export const CHECKLIST_STATUSES = ["", "OK", "Issue found"] as const;

// Reference data (small lookup lists) used by the create/edit form.
export type NamedOption = { id: number; name: string; sort_order?: number };

// A special instruction, plus which property IDs it's assigned to. This is the
// "only for certain houses" feature: an instruction applies to the properties
// listed in property_ids.
export type SpecialInstruction = NamedOption & { property_ids: number[] };

// What gets stored on an inspection's special_instructions column (JSON): the
// instructions that applied for that property, and whether each was done.
export type InstructionState = { id: number; name: string; checked: boolean };

// An inspector is a login user on the inspections Supabase project.
export type Inspector = { id: string; email: string | null; name: string };

export type InspectionMeta = {
  properties: InspectionProperty[];
  reasons: NamedOption[];
  services: NamedOption[];
  specialInstructions: SpecialInstruction[];
  inspectors: Inspector[];
  me: { id: string; name: string | null };
};

// Parse the special_instructions column, which may hold either JSON (the newer
// per-property instruction states) or plain text (older rows).
export function parseSpecialInstructions(
  raw: string | null | undefined
): { states: InstructionState[]; text: string } {
  if (!raw) return { states: [], text: "" };
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed) as unknown[];
      const states = arr
        .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
        .map((x) => ({
          id: Number(x.id) || 0,
          name: String(x.name ?? ""),
          checked: x.checked === true,
        }))
        .filter((x) => x.name);
      return { states, text: "" };
    } catch {
      // fall through to text
    }
  }
  return { states: [], text: raw };
}

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
