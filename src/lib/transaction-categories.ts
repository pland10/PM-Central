// The shared category list behind "Category (yours)" on Accounting →
// Transactions. While the list is open anyone can add a category by typing it;
// once an admin locks it, only listed categories are accepted (admins can still
// add). Look-alikes ("Payroll" / "pay roll" / "PAYROLL!") are matched on entry
// and flagged for merging on Admin → Transaction categories. Pure helpers here;
// storage is transaction-categories-db.ts.

export type CategoryUsage = { name: string; count: number };

const NAME_MAX = 120;

export function normalizeCategoryName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const n = input.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  return n || null;
}

// Comparison key: lowercase letters and digits only.
export function categoryKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type CategoryDecision = { name: string; isNew: boolean } | { error: string };

// What to save when someone types `input`: the existing spelling of a
// look-alike, a new category (open list, or an admin), or a refusal.
export function decideCategory(
  input: string,
  existing: string[],
  { open, isAdmin }: { open: boolean; isAdmin: boolean }
): CategoryDecision {
  const name = normalizeCategoryName(input);
  if (!name) return { name: "", isNew: false };
  const key = categoryKey(name);
  const match = key ? existing.find((e) => categoryKey(e) === key) : undefined;
  if (match) return { name: match, isNew: false };
  if (open || isAdmin) return { name, isNew: true };
  return { error: `“${name}” isn't an approved category — pick one from the list (an admin can add new ones).` };
}

// Sets of look-alike categories (2+), each ordered most-used first.
export function duplicateGroups(usage: CategoryUsage[]): string[][] {
  const byKey = new Map<string, CategoryUsage[]>();
  for (const u of usage) {
    const k = categoryKey(u.name);
    if (!k) continue;
    byKey.set(k, [...(byKey.get(k) ?? []), u]);
  }
  return [...byKey.values()]
    .filter((g) => g.length > 1)
    .map((g) => [...g].sort((a, b) => b.count - a.count).map((u) => u.name));
}
