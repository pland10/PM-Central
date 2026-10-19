import type { MoveInMeta, MoveInRoom } from "./types";

// The move-in inspection template: a room-by-room condition survey, ported from
// PMI Lighthouse's paper "Move-In Checklist". A move-in inspection is just an
// inspection with inspection_type = "move_in" whose checklist is seeded from
// this template, so it reuses the whole inspection system (list, detail, photos,
// send-summary, resolve).
//
// Bedrooms and bathrooms are configurable (1–6 each) with custom labels; the
// chosen rooms live on the inspection's meta (meta.bedrooms / meta.bathrooms),
// and their checklist items are keyed by the room id (e.g. "bed3.closets").
//
// Each item's kind / hint are DERIVED from this template by item_key at render
// time, so storing a move-in checklist needs no schema change — the existing
// checklist columns carry the captured values:
//   - kind "condition": free-text note        -> issue_notes
//   - kind "working":   Yes / No + a note      -> status (Yes|No) + issue_notes
//   - kind "value":     a captured value       -> issue_notes (e.g. "20x25x1")
export type MoveInItemKind = "condition" | "working" | "value";

export type MoveInItem = {
  key: string; // globally unique, namespaced by section (e.g. "kitchen.sink")
  label: string;
  hint: string;
  kind: MoveInItemKind;
  // When true, the form offers a photo capture on this item (e.g. an
  // appliance's serial/model plate, or a utility label/location).
  photo?: boolean;
};

export type MoveInSection = {
  id: string;
  title: string;
  optional?: boolean; // "if applicable" areas
  items: MoveInItem[];
};

export const MAX_ROOMS = 6;
export const DEFAULT_BEDROOMS = 4;
export const DEFAULT_BATHROOMS = 2;

function cond(key: string, label: string, hint: string, photo = false): MoveInItem {
  return { key, label, hint, kind: "condition", photo };
}
function work(key: string, label: string, hint: string, photo = false): MoveInItem {
  return { key, label, hint, kind: "working", photo };
}
function val(key: string, label: string, hint: string, photo = false): MoveInItem {
  return { key, label, hint, kind: "value", photo };
}

// Per-room item sets, keyed by the room's id prefix.
export function bedroomItems(id: string): MoveInItem[] {
  return [
    cond(`${id}.closets`, "Closets", "Doors open and close; shelves and rods undamaged."),
    cond(`${id}.lighting`, "Lighting", "Light fixtures and switches functional."),
    cond(`${id}.windows`, "Windows", "Open, close, and lock; no cracks or broken seals."),
    cond(`${id}.walls_floors`, "Walls / Floors", "Any visible damage or marks."),
    cond(`${id}.doors`, "Doors", "Function, including locks and handles."),
  ];
}

export function bathroomItems(id: string): MoveInItem[] {
  return [
    work(`${id}.sink`, "Sink / Vanity", "Water flow, drainage, and leaks."),
    work(`${id}.toilet`, "Toilet", "Flushing, no leaks at base, seat condition."),
    work(`${id}.shower`, "Shower / Bathtub", "Leaks, water pressure, drainage, shower doors."),
    cond(`${id}.mirrors`, "Mirrors", "Cracks, damage, cleanliness."),
    cond(`${id}.towel_bars`, "Towel bars / Racks", "Functionality and any damage."),
    cond(`${id}.flooring`, "Flooring", "Mildew, water stains, or cracks."),
  ];
}

// Fixed (non-repeating) sections.
const GENERAL: MoveInSection = {
  id: "general",
  title: "General Conditions",
  items: [
    val("general.cooling", "Cooling type", "What is the cooling type?"),
    val("general.heating", "Heating type", "What is the heating type?"),
    val("general.filter_size", "Filter size", "What is the filter size?"),
    val("general.breaker_box", "Breaker box location", "Where is the breaker box? Add a photo.", true),
    val("general.water_shutoff", "Main water shut-off", "Where is the valve? Add a photo.", true),
    val("general.gas_shutoff", "Gas shut-off", "Where is the gas shut-off valve?"),
  ],
};

const KITCHEN: MoveInSection = {
  id: "kitchen",
  title: "Kitchen",
  items: [
    work("kitchen.sink", "Sink", "Leaks, water pressure, and drainage."),
    work("kitchen.dishwasher", "Dishwasher", "Function; add a photo of the serial/model plate.", true),
    work("kitchen.oven_stove", "Oven / Stove", "Function; add a photo of the serial/model plate.", true),
    work("kitchen.refrigerator", "Refrigerator", "Function; add a photo of the serial/model plate.", true),
    cond("kitchen.cabinets", "Cabinets / Drawers", "Handles, cleanliness, and damage."),
    cond("kitchen.countertops", "Countertops", "Cracks, burns, or damage."),
    work("kitchen.microwave", "Microwave (if applicable)", "Function; add a photo of the serial/model plate.", true),
  ],
};

const LIVING: MoveInSection = {
  id: "living",
  title: "Living Room",
  items: [
    cond("living.lighting", "Lighting fixtures", "All fixtures functional and undamaged."),
    cond("living.hvac", "Heating / Air conditioning", "Units operate; add a photo of the HVAC label.", true),
    cond("living.ceiling_fan", "Ceiling fan (if applicable)", "Operation, noise; remote batteries."),
    cond("living.walls", "Walls", "Holes, scuffs, or marks."),
    cond("living.floors", "Floors", "Scratches, stains, or carpet damage."),
  ],
};

const LAUNDRY: MoveInSection = {
  id: "laundry",
  title: "Laundry Room",
  optional: true,
  items: [
    work("laundry.washer", "Washer", "Function; add a photo of the serial/model plate.", true),
    work("laundry.dryer", "Dryer", "Function; add a photo of the serial/model plate.", true),
    cond("laundry.cabinets", "Cabinets / Shelves", "Damage or cleanliness."),
    cond("laundry.flooring", "Flooring", "Water damage or stains."),
  ],
};

const EXTERIOR: MoveInSection = {
  id: "exterior",
  title: "Exterior",
  optional: true,
  items: [
    cond("exterior.lighting", "Lighting", "Exterior lights functional."),
    cond("exterior.mailbox", "Mailbox", "Secure and undamaged."),
  ],
};

const FRONT_YARD: MoveInSection = {
  id: "frontyard",
  title: "Front Yard",
  optional: true,
  items: [
    cond("frontyard.landscaping", "Landscaping / Lawn", "Condition of lawn and plantings."),
    cond("frontyard.walkway", "Walkway / Driveway", "Cracks, damage, trip hazards."),
    cond("frontyard.lighting", "Lighting", "Exterior front lights functional."),
    cond("frontyard.entry", "Front door / Entry", "Door, lock, and entry condition."),
  ],
};

const BACK_YARD: MoveInSection = {
  id: "backyard",
  title: "Back Yard",
  optional: true,
  items: [
    cond("backyard.landscaping", "Landscaping / Lawn", "Condition of lawn and plantings."),
    cond("backyard.fence", "Fence / Gates", "Damage or functionality issues."),
    cond("backyard.patio", "Patio / Deck", "Condition and damage."),
    cond("backyard.lighting", "Lighting", "Exterior rear lights functional."),
  ],
};

const GARAGE: MoveInSection = {
  id: "garage",
  title: "Garage",
  optional: true,
  items: [
    cond("garage.door", "Garage door / Opener", "Door operates; opener and remotes."),
    cond("garage.walls_floor", "Walls / Floor", "Cracks, stains, or damage."),
    cond("garage.lighting", "Lighting / Outlets", "Lights and outlets functional."),
    cond("garage.windows_doors", "Windows / Doors", "Function, locks, and damage."),
  ],
};

export function defaultRoomLabel(kind: "bed" | "bath", n: number): string {
  return kind === "bed" ? `Bedroom ${n}` : `Bathroom ${n}`;
}

// Default rooms for a new move-in (also the fallback for inspections saved
// before rooms were configurable, so their bath1/bath2 + bed1..bed4 keys still
// resolve).
export function defaultRooms(kind: "bed" | "bath"): MoveInRoom[] {
  const count = kind === "bed" ? DEFAULT_BEDROOMS : DEFAULT_BATHROOMS;
  return Array.from({ length: count }, (_, i) => ({
    id: `${kind}${i + 1}`,
    label: defaultRoomLabel(kind, i + 1),
  }));
}

function roomsOrDefault(rooms: MoveInRoom[] | undefined, kind: "bed" | "bath"): MoveInRoom[] {
  return rooms && rooms.length ? rooms : defaultRooms(kind);
}

// The ordered sections for a given inspection's meta: fixed sections with the
// chosen bathrooms and bedrooms slotted in. Used by the detail page and the
// summary email (the form builds its own live sections from editable state).
export function buildMoveInSections(meta?: MoveInMeta | null): MoveInSection[] {
  const baths = roomsOrDefault(meta?.bathrooms, "bath");
  const beds = roomsOrDefault(meta?.bedrooms, "bed");
  return [
    GENERAL,
    KITCHEN,
    ...baths.map((r) => ({ id: r.id, title: r.label, items: bathroomItems(r.id) })),
    LIVING,
    ...beds.map((r) => ({ id: r.id, title: r.label, items: bedroomItems(r.id) })),
    LAUNDRY,
    EXTERIOR,
    FRONT_YARD,
    BACK_YARD,
    GARAGE,
  ];
}

export function isMoveInType(t: string | null | undefined): boolean {
  return (t || "").trim() === "move_in";
}
