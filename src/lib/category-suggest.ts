// Bank Transactions: guess an uncategorized row's category from the same
// merchant's other transactions — the category used most for that merchant,
// ties going to the most recent. Pure; the table shows the guess under the
// Category box for one click to apply.
//
// The page loads only the latest transactions, so the server also counts the
// older ones (loadCategoryHistory in ./category-suggest-db.ts) and the table
// adds the rows on screen to those counts — edits there still update at once.

type Row = { merchantName: string; name: string; categoryOverride: string; postedDate: string | null };

// Category counts for one merchant from transactions not on screen.
export type CategoryHistoryEntry = { key: string; category: string; count: number; latest: string };

// Same merchant despite case, spacing or a store number ("HOMEDEPOT #6512").
// Falls back to the bank description when the bank gave no merchant name.
export function merchantKey(merchantName: string, name: string): string {
  const raw = merchantName.trim() || name.trim();
  return raw
    .toLowerCase()
    .replace(/[#*]?\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Tally = { count: number; latest: string; spelling: string };

// merchant key → (lower-cased category → tally). Spelling follows the latest use.
class Tallies {
  private byMerchant = new Map<string, Map<string, Tally>>();

  add(key: string, category: string, count: number, date: string) {
    const cat = category.trim();
    if (!key || !cat || count <= 0) return;
    let tallies = this.byMerchant.get(key);
    if (!tallies) this.byMerchant.set(key, (tallies = new Map()));
    const t = tallies.get(cat.toLowerCase());
    if (!t) {
      tallies.set(cat.toLowerCase(), { count, latest: date, spelling: cat });
      return;
    }
    t.count += count;
    if (date >= t.latest) {
      t.latest = date;
      t.spelling = cat;
    }
  }

  entries(): CategoryHistoryEntry[] {
    const out: CategoryHistoryEntry[] = [];
    for (const [key, tallies] of this.byMerchant) {
      for (const t of tallies.values()) out.push({ key, category: t.spelling, count: t.count, latest: t.latest });
    }
    return out;
  }

  best(): Map<string, string> {
    const out = new Map<string, string>();
    for (const [key, tallies] of this.byMerchant) {
      let top: Tally | null = null;
      for (const t of tallies.values()) {
        if (!top || t.count > top.count || (t.count === top.count && t.latest > top.latest)) top = t;
      }
      if (top) out.set(key, top.spelling);
    }
    return out;
  }
}

// Fold the server's grouped rows (raw merchant text, category, count, latest
// date) into one entry per merchant key + category.
export function categoryHistoryFrom(
  rows: { merchant: string; category: string; n: number; latest: string | null }[]
): CategoryHistoryEntry[] {
  const t = new Tallies();
  for (const r of rows) t.add(merchantKey(r.merchant, ""), r.category, r.n, r.latest ?? "");
  return t.entries();
}

// row id → suggested category, for rows with no category of their own.
export function suggestCategories<T extends Row>(
  rows: T[],
  idOf: (r: T) => string,
  history: CategoryHistoryEntry[] = []
): Record<string, string> {
  const t = new Tallies();
  for (const h of history) t.add(h.key, h.category, h.count, h.latest);
  for (const r of rows) t.add(merchantKey(r.merchantName, r.name), r.categoryOverride, 1, r.postedDate ?? "");
  const best = t.best();

  const out: Record<string, string> = {};
  for (const r of rows) {
    if (r.categoryOverride.trim()) continue;
    const guess = best.get(merchantKey(r.merchantName, r.name));
    if (guess) out[idOf(r)] = guess;
  }
  return out;
}
