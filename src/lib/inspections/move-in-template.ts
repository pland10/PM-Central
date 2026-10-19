// The move-in inspection template: a room-by-room condition survey, ported from
// PMI Lighthouse's paper "Move-In Checklist". A move-in inspection is just an
// inspection with inspection_type = "move_in" whose checklist is seeded from
// this template, so it reuses the whole inspection system (list, detail, photos,
// send-summary, resolve).
//
// Each item's section / kind / hint are DERIVED from this template by item_key
// at render time, so storing a move-in checklist needs no schema change — the
// existing checklist columns carry the captured values:
//   - kind "condition": free-text note        -> issue_notes
//   - kind "working":   Yes / No + a note      -> status (Yes|No) + issue_notes
//   - kind "value":     a captured value       -> issue_notes (e.g. "20x25x1")
export type MoveInItemKind = "condition" | "working" | "value";

export type MoveInItem = {
  key: string; // globally unique, namespaced by section (e.g. "kitchen.sink")
  label: string;
  hint: string;
  kind: MoveInItemKind;
};

export type MoveInSection = {
  id: string;
  title: string;
  optional?: boolean; // "if applicable" areas
  items: MoveInItem[];
};

// Helpers to keep the repeated room definitions readable.
function cond(key: string, label: string, hint: string): MoveInItem {
  return { key, label, hint, kind: "condition" };
}
function work(key: string, label: string, hint: string): MoveInItem {
  return { key, label, hint, kind: "working" };
}
function val(key: string, label: string, hint: string): MoveInItem {
  return { key, label, hint, kind: "value" };
}

function bedroom(n: number): MoveInSection {
  const p = `bed${n}`;
  return {
    id: p,
    title: `Bedroom ${n}`,
    optional: n > 1,
    items: [
      cond(`${p}.closets`, "Closets", "Doors open and close; shelves and rods undamaged."),
      cond(`${p}.lighting`, "Lighting", "Light fixtures and switches functional."),
      cond(`${p}.windows`, "Windows", "Open, close, and lock; no cracks or broken seals."),
      cond(`${p}.walls_floors`, "Walls / Floors", "Any visible damage or marks."),
      cond(`${p}.doors`, "Doors", "Function, including locks and handles."),
    ],
  };
}

function bathroom(n: number): MoveInSection {
  const p = `bath${n}`;
  return {
    id: p,
    title: `Bathroom ${n}`,
    optional: n > 1,
    items: [
      work(`${p}.sink`, "Sink / Vanity", "Water flow, drainage, and leaks."),
      work(`${p}.toilet`, "Toilet", "Flushing, no leaks at base, seat condition."),
      work(`${p}.shower`, "Shower / Bathtub", "Leaks, water pressure, drainage, shower doors."),
      cond(`${p}.mirrors`, "Mirrors", "Cracks, damage, cleanliness."),
      cond(`${p}.towel_bars`, "Towel bars / Racks", "Functionality and any damage."),
      cond(`${p}.flooring`, "Flooring", "Mildew, water stains, or cracks."),
    ],
  };
}

export const MOVE_IN_TEMPLATE: MoveInSection[] = [
  {
    id: "general",
    title: "General Conditions",
    items: [
      cond("general.walls", "Walls", "Holes, scratches, or peeling paint."),
      cond("general.floors", "Floors", "Stains, scratches, or damage."),
      cond("general.ceiling", "Ceiling", "Leaks, stains, cracks, or damage."),
      cond("general.windows", "Windows", "Open, close, and lock; cracks or damaged seals."),
      cond("general.doors", "Doors", "Function, hinges, locks, and damage."),
      val("general.cooling", "Cooling type", "What is the cooling type?"),
      val("general.heating", "Heating type", "What is the heating type?"),
      val("general.filter_size", "Filter size", "What is the filter size?"),
      val("general.breaker_box", "Breaker box location", "Where is the breaker box?"),
      val("general.water_shutoff", "Main water shut-off", "Where is the main water shut-off valve?"),
      val("general.gas_shutoff", "Gas shut-off", "Where is the gas shut-off valve?"),
      val("general.gfi", "GFI plug location(s)", "Where are the GFI plugs?"),
    ],
  },
  {
    id: "kitchen",
    title: "Kitchen",
    items: [
      work("kitchen.sink", "Sink", "Leaks, water pressure, and drainage."),
      work("kitchen.dishwasher", "Dishwasher", "Functionality, cleanliness, and leaks."),
      work("kitchen.oven_stove", "Oven / Stove", "Burners and oven function; cleanliness."),
      work("kitchen.refrigerator", "Refrigerator", "Cooling, door seals, and cleanliness."),
      cond("kitchen.cabinets", "Cabinets / Drawers", "Handles, cleanliness, and damage."),
      cond("kitchen.countertops", "Countertops", "Cracks, burns, or damage."),
      work("kitchen.microwave", "Microwave (if applicable)", "Cleanliness and functionality."),
    ],
  },
  bathroom(1),
  bathroom(2),
  {
    id: "living",
    title: "Living Room",
    items: [
      cond("living.lighting", "Lighting fixtures", "All fixtures functional and undamaged."),
      cond("living.hvac", "Heating / Air conditioning", "Units operate properly."),
      cond("living.ceiling_fan", "Ceiling fan (if applicable)", "Operation, noise; remote batteries."),
      cond("living.walls", "Walls", "Holes, scuffs, or marks."),
      cond("living.floors", "Floors", "Scratches, stains, or carpet damage."),
    ],
  },
  bedroom(1),
  bedroom(2),
  bedroom(3),
  bedroom(4),
  {
    id: "laundry",
    title: "Laundry Room",
    optional: true,
    items: [
      work("laundry.washer", "Washer", "Functionality, water flow, and leaks."),
      work("laundry.dryer", "Dryer", "Functionality and proper venting."),
      cond("laundry.cabinets", "Cabinets / Shelves", "Damage or cleanliness."),
      cond("laundry.flooring", "Flooring", "Water damage or stains."),
    ],
  },
  {
    id: "exterior",
    title: "Exterior",
    optional: true,
    items: [
      cond("exterior.yard", "Yard / Garden", "Landscaping and any damage."),
      cond("exterior.gates_fence", "Gates / Fence", "Damage or functionality issues."),
      cond("exterior.lighting", "Lighting", "Exterior lights functional."),
      cond("exterior.mailbox", "Mailbox", "Secure and undamaged."),
    ],
  },
];

// Flat lookup: item_key -> { section title, item } for render-time enrichment.
export type MoveInItemInfo = { sectionId: string; sectionTitle: string; item: MoveInItem };

export const MOVE_IN_ITEM_BY_KEY: Map<string, MoveInItemInfo> = new Map(
  MOVE_IN_TEMPLATE.flatMap((s) =>
    s.items.map((item) => [item.key, { sectionId: s.id, sectionTitle: s.title, item }] as const)
  )
);

export function isMoveInType(t: string | null | undefined): boolean {
  return (t || "").trim() === "move_in";
}
