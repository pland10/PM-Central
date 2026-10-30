// Admin "hide" filters for the Accounting → Transactions tab. An admin enters a
// pattern like *CSG FORTE* (with a required comment saying why), and any
// transaction whose description or merchant matches is left out of the tab and
// its totals. Pure helpers here; storage is transaction-filters-db.ts.

export type HideRule = {
  id: number;
  pattern: string; // as entered, e.g. "*CSG FORTE*"
  comment: string; // why the rule exists
  createdBy: string;
  createdAt: string | null;
};

const PATTERN_MAX = 200;
const COMMENT_MAX = 1000;

// Trim/collapse spaces; null if empty or nothing but wildcards (which would
// hide every transaction).
export function normalizeHidePattern(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const p = input.replace(/\s+/g, " ").trim().slice(0, PATTERN_MAX);
  return p.replace(/[*\s]/g, "") ? p : null;
}

export function normalizeComment(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const c = input.trim().slice(0, COMMENT_MAX);
  return c || null;
}

// User pattern → case-insensitive SQL LIKE pattern. `*` is the wildcard; text
// with no `*` matches anywhere. SQL's own wildcards (% _) and the escape char
// are escaped so they match literally.
export function patternToLike(pattern: string): string {
  const escaped = pattern.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, "%");
  return pattern.includes("*") ? escaped : `%${escaped}%`;
}
