// Bank Transactions: guess an uncategorized row's category from the other rows
// with the same merchant — the category used most for that merchant, ties going
// to the most recent. Pure; the table shows the guess under the Category box
// for one click to apply.

type Row = { merchantName: string; name: string; categoryOverride: string; postedDate: string | null };

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

// row id → suggested category, for rows with no category of their own.
export function suggestCategories<T extends Row>(rows: T[], idOf: (r: T) => string): Record<string, string> {
  const byMerchant = new Map<string, Map<string, Tally>>();
  for (const r of rows) {
    const cat = r.categoryOverride.trim();
    const key = merchantKey(r.merchantName, r.name);
    if (!cat || !key) continue;
    const tallies = byMerchant.get(key) ?? new Map<string, Tally>();
    byMerchant.set(key, tallies);
    const date = r.postedDate ?? "";
    const t = tallies.get(cat.toLowerCase());
    if (!t) tallies.set(cat.toLowerCase(), { count: 1, latest: date, spelling: cat });
    else {
      t.count++;
      if (date >= t.latest) {
        t.latest = date;
        t.spelling = cat;
      }
    }
  }

  const best = new Map<string, string>();
  for (const [key, tallies] of byMerchant) {
    let top: Tally | null = null;
    for (const t of tallies.values()) {
      if (!top || t.count > top.count || (t.count === top.count && t.latest > top.latest)) top = t;
    }
    if (top) best.set(key, top.spelling);
  }

  const out: Record<string, string> = {};
  for (const r of rows) {
    if (r.categoryOverride.trim()) continue;
    const guess = best.get(merchantKey(r.merchantName, r.name));
    if (guess) out[idOf(r)] = guess;
  }
  return out;
}
