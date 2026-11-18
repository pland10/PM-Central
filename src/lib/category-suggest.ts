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

// Card processors that put their own code before the merchant ("SQ *JOES
// PLUMBING", "TST* JOES DINER", "PAYPAL *ACME").
const PROCESSORS = new Set(["sq", "sqc", "tst", "sp", "pp", "paypal", "py", "in", "fs", "ckc", "cke", "ec", "dd", "bt", "wpy", "pos"]);
// Bank boilerplate and company suffixes that say nothing about the merchant.
const NOISE = new Set([
  "pos", "debit", "credit", "purchase", "card", "checkcard", "chkcard", "visa", "mastercard", "ach", "web", "ppd", "ccd",
  "ref", "id", "inc", "llc", "ltd", "co", "corp", "the", "www", "com", "net", "online", "recurring",
]);

// One key per merchant, however the bank spells it: case, spacing and
// punctuation, dates and store / reference numbers, card-processor prefixes and
// bank boilerplate all drop out ("POS DEBIT HOME-DEPOT #6512 11/14" and
// "The Home Depot" → "homedepot"). Falls back to the bank description when the
// bank gave no merchant name.
export function merchantKey(merchantName: string, name: string): string {
  let raw = (merchantName.trim() || name.trim()).toLowerCase();
  const star = raw.indexOf("*");
  if (star >= 0) {
    const before = raw.slice(0, star).trim();
    // "SQ *JOES" → the merchant follows the processor; "AMZN MKTP US*2K3L" →
    // what follows a merchant's * is an order / reference code.
    raw = PROCESSORS.has(before) ? raw.slice(star + 1) : before;
  }
  return raw
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !/\d/.test(t) && !NOISE.has(t))
    .join("");
}

// Damerau (optimal string alignment) distance — a swapped pair counts as one
// edit — or Infinity once it must exceed `max` (stops early: most pairs aren't close).
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return Infinity;
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return Infinity;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

const MIN_FUZZY = 5; // shorter names than this are too ambiguous to stretch
const MIN_SIMILARITY = 0.8;

// The known merchant key closest to `key` when there's no exact one: one starts
// with the other (a description that adds a location, "homedepotelmontny"), or
// a small misspelling ("homedepto"). Only names with the same first letter are
// compared — misspellings rarely change it, and it keeps this fast. null when
// nothing is close enough.
export function matchMerchant(key: string, known: Iterable<string>): string | null {
  if (key.length < MIN_FUZZY) return null;
  let best: string | null = null;
  let bestScore = 0;
  for (const k of known) {
    if (k === key) return k;
    if (k.length < MIN_FUZZY || k[0] !== key[0]) continue;
    const [short, long] = k.length <= key.length ? [k, key] : [key, k];
    let score = 0;
    if (long.startsWith(short)) score = 0.9 + short.length / 1000; // prefer the longest shared start
    else {
      const max = Math.floor(long.length * (1 - MIN_SIMILARITY));
      score = 1 - editDistance(key, k, max) / long.length;
    }
    if (score >= MIN_SIMILARITY && score > bestScore) {
      best = k;
      bestScore = score;
    }
  }
  return best;
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

  // No exact merchant? Use the closest one — worked out once per name.
  const close = new Map<string, string | null>();
  const guessFor = (key: string): string | undefined => {
    const exact = best.get(key);
    if (exact) return exact;
    if (!close.has(key)) close.set(key, matchMerchant(key, best.keys()));
    const k = close.get(key);
    return k ? best.get(k) : undefined;
  };

  const out: Record<string, string> = {};
  for (const r of rows) {
    if (r.categoryOverride.trim()) continue;
    const guess = guessFor(merchantKey(r.merchantName, r.name));
    if (guess) out[idOf(r)] = guess;
  }
  return out;
}
