// Calendar person colors: each person picks one from this set, and no two
// people can share one (enforced by calendar_user_colors.color UNIQUE). A fixed
// set (not free hex) keeps them clearly different. No red: red means overdue.
export const CALENDAR_COLORS = [
  { name: "Blue", hex: "#2563EB" },
  { name: "Green", hex: "#16A34A" },
  { name: "Purple", hex: "#9333EA" },
  { name: "Orange", hex: "#EA580C" },
  { name: "Pink", hex: "#DB2777" },
  { name: "Teal", hex: "#0D9488" },
  { name: "Gold", hex: "#CA8A04" },
  { name: "Indigo", hex: "#4338CA" },
  { name: "Cyan", hex: "#0891B2" },
  { name: "Lime", hex: "#65A30D" },
  { name: "Brown", hex: "#92400E" },
  { name: "Slate", hex: "#475569" },
] as const;

// Unassigned tasks, or owners who haven't picked a color yet.
export const NO_COLOR = "#94A3B8";

export function isCalendarColor(hex: unknown): hex is string {
  return typeof hex === "string" && CALENDAR_COLORS.some((c) => c.hex.toLowerCase() === hex.toLowerCase());
}

export const colorName = (hex: string) => CALENDAR_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.name ?? "Color";
