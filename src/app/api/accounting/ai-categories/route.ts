import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { canAccessAccounting } from "@/lib/accounting-access";
import { AI_CATEGORY_MODEL, AI_MAX_PER_REQUEST, aiClient, aiExamplesFrom, suggestWithAi } from "@/lib/ai-category";
import { loadAiCategories, loadTxnsForAi, saveAiCategories } from "@/lib/ai-category-db";
import { listCategoryNamesSafe } from "@/lib/transaction-categories-db";
import { loadCategoryHistory } from "@/lib/category-suggest-db";

// Bank Transactions: Claude's category guesses for rows the history-based guess
// couldn't place. The table posts those rows' ids; transactions Claude already
// answered come from the cache, the rest are asked about once and cached.
// Returns id → category for the ones with a guess. Off (configured: false)
// until ANTHROPIC_API_KEY is set.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!isFeatureEnabled("accounting")) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const user = await getCurrentUser();
  if (!canAccessAccounting(user)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  if (!Array.isArray(body.ids)) return NextResponse.json({ error: "Send the transaction ids." }, { status: 400 });
  const ids = [...new Set(body.ids.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 200))].slice(
    0,
    AI_MAX_PER_REQUEST
  );

  const client = aiClient();
  if (!client) return NextResponse.json({ configured: false, suggestions: {} });

  const cached = await loadAiCategories(prisma, ids);
  const todo = ids.filter((id) => !(id in cached));
  let fresh: Record<string, string | null> = {};
  if (todo.length) {
    try {
      const txns = await loadTxnsForAi(prisma, todo);
      if (txns.length) {
        const [categories, history] = await Promise.all([listCategoryNamesSafe(), loadCategoryHistory(prisma, [])]);
        fresh = await suggestWithAi(client, categories, aiExamplesFrom(history), txns);
        await saveAiCategories(prisma, fresh, AI_CATEGORY_MODEL);
      }
    } catch {
      // Never fails the page: the rows just show no AI guess this time.
    }
  }

  const suggestions = Object.fromEntries(
    Object.entries({ ...cached, ...fresh }).filter((e): e is [string, string] => typeof e[1] === "string")
  );
  return NextResponse.json({ configured: true, suggestions });
}
