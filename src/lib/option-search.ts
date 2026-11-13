// Search a list of option labels for a type-ahead box (property / category
// pickers). Every typed word must appear (any order, case-insensitive). Results
// are ranked: label starts with the query, then a word starts with each term,
// then plain substring — ties keep the list's own order. Capped at `limit`.
// A 1–2 character term must start a word ("2" finds "Unit 2", not "8204"); longer
// terms may match anywhere ("bury" finds "Westbury").

export type OptionSearch = { items: string[]; total: number; more: number };

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

export function searchOptions(options: string[], query: string, limit: number): OptionSearch {
  const q = query.trim().toLowerCase();
  if (!q) return { items: options.slice(0, limit), total: options.length, more: Math.max(0, options.length - limit) };
  const terms = q.split(/\s+/).filter(Boolean);

  const scored: { label: string; score: number; i: number }[] = [];
  options.forEach((label, i) => {
    const lower = label.toLowerCase();
    const ws = words(label);
    const atWordStart = (t: string) => ws.some((w) => w.startsWith(t)) || lower.startsWith(t);
    if (!terms.every((t) => (t.length >= 3 ? lower.includes(t) : atWordStart(t)))) return;
    let score: number;
    if (lower.startsWith(q)) score = 0;
    else if (terms.every(atWordStart)) score = 1;
    else score = 2;
    scored.push({ label, score, i });
  });
  scored.sort((a, b) => a.score - b.score || a.i - b.i);
  const items = scored.slice(0, limit).map((s) => s.label);
  return { items, total: scored.length, more: Math.max(0, scored.length - limit) };
}
