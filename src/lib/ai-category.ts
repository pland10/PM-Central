import Anthropic from "@anthropic-ai/sdk";
import type { CategoryHistoryEntry } from "@/lib/category-suggest";

// Bank Transactions: Claude's guess at a category for a transaction the
// history-based guess (./category-suggest.ts) couldn't place. Claude picks from
// the approved category list only, using how this company categorized its
// merchants before as examples. The answer comes back in a fixed JSON shape
// and anything not on the list is dropped. Results are cached per transaction
// (./ai-category-db.ts), so each one is asked about once.

export const AI_CATEGORY_MODEL = "claude-opus-5-5";
export const AI_BATCH_SIZE = 50;
export { AI_MAX_PER_REQUEST } from "@/lib/category-suggest";
const MAX_EXAMPLES = 200;

export type AiTxn = { id: string; merchant: string; description: string; amount: number; date: string | null };
export type AiExample = { merchant: string; categories: { category: string; count: number }[] };

// A Claude client when ANTHROPIC_API_KEY is set (Vercel env), else null — the
// AI guess is off and the page shows only the history-based one.
export function aiClient(): Anthropic | null {
  return process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
}

// Past categories per merchant, busiest merchants first, for the prompt.
export function aiExamplesFrom(history: CategoryHistoryEntry[], limit = MAX_EXAMPLES): AiExample[] {
  const byMerchant = new Map<string, { category: string; count: number }[]>();
  for (const h of history) {
    const list = byMerchant.get(h.key) ?? [];
    list.push({ category: h.category, count: h.count });
    byMerchant.set(h.key, list);
  }
  const total = (cats: { count: number }[]) => cats.reduce((n, c) => n + c.count, 0);
  return [...byMerchant]
    .map(([merchant, categories]) => ({ merchant, categories: categories.sort((a, b) => b.count - a.count) }))
    .sort((a, b) => total(b.categories) - total(a.categories) || a.merchant.localeCompare(b.merchant))
    .slice(0, limit);
}

const SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, category: { type: "string" } },
        required: ["id", "category"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
} as const;

function systemPrompt(categories: string[], examples: AiExample[]): string {
  const past = examples.length
    ? examples.map((e) => `- ${e.merchant}: ${e.categories.map((c) => `${c.category} (${c.count})`).join(", ")}`).join("\n")
    : "(none yet)";
  return [
    "You categorize card and bank transactions for a property management company, for its bookkeeping.",
    "For each transaction, pick the one category from the list below that it most likely belongs to. Bank descriptions are messy: they add store numbers, dates, locations and card-processor prefixes, and abbreviate or misspell names, so read past that to the merchant.",
    "Lean on how the company categorized its merchants before (below). For a merchant it hasn't seen, use what the merchant sells and the amount.",
    'Use a category name exactly as listed. If no category is a reasonable fit, give "" for that transaction rather than guessing.',
    "Answer every transaction id you're given.",
    "",
    "Categories:",
    ...categories.map((c) => `- ${c}`),
    "",
    "Past categories by merchant (normalized merchant name: category (times used)):",
    past,
  ].join("\n");
}

// Claude's answer → id → category (the list's spelling) or null (no guess),
// for every id asked about. null overall if the answer isn't the expected JSON.
export function parseAiAnswer(text: string, categories: string[], ids: string[]): Record<string, string | null> | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const list = (data as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(list)) return null;
  const canonical = new Map(categories.map((c) => [c.toLowerCase(), c]));
  const asked = new Set(ids);
  const out: Record<string, string | null> = Object.fromEntries(ids.map((id) => [id, null]));
  for (const s of list) {
    const id = typeof s?.id === "string" ? s.id : "";
    const cat = typeof s?.category === "string" ? canonical.get(s.category.trim().toLowerCase()) : undefined;
    if (asked.has(id) && cat) out[id] = cat;
  }
  return out;
}

async function askBatch(
  client: Anthropic,
  system: string,
  categories: string[],
  txns: AiTxn[]
): Promise<Record<string, string | null> | null> {
  const lines = txns.map((t) =>
    JSON.stringify({ id: t.id, merchant: t.merchant, description: t.description, amount: t.amount, date: t.date })
  );
  try {
    const response = await client.beta.messages.create({
      model: AI_CATEGORY_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Categorize these transactions (one JSON object per line):\n${lines.join("\n")}` }],
    });
    if (response.stop_reason !== "end_turn") {
      // Declined, cut off, …: try again another time. (Logs the reason only —
      // never transaction details.)
      console.warn(`[ai-categories] no answer: stop_reason=${response.stop_reason}`);
      return null;
    }
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return parseAiAnswer(
      text,
      categories,
      txns.map((t) => t.id)
    );
  } catch (e) {
    console.warn(`[ai-categories] Claude request failed: ${e instanceof Anthropic.APIError ? `HTTP ${e.status}` : "no response"}`);
    return null;
  }
}

// id → category or null (asked, no confident guess). A batch that failed is
// left out entirely, so those transactions are asked about again later.
export async function suggestWithAi(
  client: Anthropic,
  categories: string[],
  examples: AiExample[],
  txns: AiTxn[]
): Promise<Record<string, string | null>> {
  if (categories.length === 0 || txns.length === 0) return {};
  const system = systemPrompt(categories, examples);
  const out: Record<string, string | null> = {};
  for (let i = 0; i < txns.length; i += AI_BATCH_SIZE) {
    const answer = await askBatch(client, system, categories, txns.slice(i, i + AI_BATCH_SIZE));
    if (answer) Object.assign(out, answer);
  }
  return out;
}
