// Preventive (scheduled/routine) maintenance vs. reactive repairs.
//
// Source of truth, in order: a Rentvine recurring work order (every WO it
// creates carries recurringWorkOrderID — synced into rv_work_orders.recurring),
// then the title. Rentvine has no recurring WOs set up yet and tune-ups are
// typed by hand ("HVAC Tuneup", "HVAC tune up", …), so the title rules carry it
// for now. Add a pattern here for any new kind of routine job.
const PREVENTIVE_PATTERNS: RegExp[] = [
  /\btune[\s-]?ups?\b/i, // HVAC tune-up / tuneup / tune up
  /\bsprinkler\b.*\bwinteri[sz]/i, // sprinkler winterization
  /\bwinteri[sz]\w*\b.*\bsprinkler/i, // winterize sprinklers
];

export function isPreventiveTitle(title: string | null | undefined): boolean {
  const t = title ?? "";
  return PREVENTIVE_PATTERNS.some((re) => re.test(t));
}

// An admin-managed keyword rule (Admin → Preventive maintenance), stored in
// preventive_patterns. Pure helpers here; storage is preventive-patterns-db.ts.
export type PreventivePattern = {
  id: number;
  pattern: string; // keyword, matched anywhere in the title (case-insensitive)
  note: string; // optional note on why the rule exists
  createdBy: string;
  createdAt: string | null;
};

const PATTERN_MAX = 100;

// Trim / collapse whitespace; null if empty. (Plain keyword — no wildcards; it
// matches anywhere in the title.)
export function normalizePreventivePattern(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const p = input.replace(/\s+/g, " ").trim().slice(0, PATTERN_MAX);
  return p || null;
}

// Preventive if a built-in rule matches OR the title contains any admin keyword
// (case-insensitive). `patterns` are the admin-managed keywords.
export function matchesPreventive(title: string | null | undefined, patterns: string[]): boolean {
  if (isPreventiveTitle(title)) return true;
  const t = (title ?? "").toLowerCase();
  return patterns.some((p) => {
    const needle = (p ?? "").trim().toLowerCase();
    return needle.length > 0 && t.includes(needle);
  });
}
