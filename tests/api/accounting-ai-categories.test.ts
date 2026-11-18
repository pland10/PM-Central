import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/config/features", () => ({ isFeatureEnabled: vi.fn(() => true) }));
vi.mock("@/lib/auth/supabase-server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/ai-category-db", () => ({ loadAiCategories: vi.fn(), loadTxnsForAi: vi.fn(), saveAiCategories: vi.fn() }));
vi.mock("@/lib/transaction-categories-db", () => ({ listCategoryNamesSafe: vi.fn() }));
vi.mock("@/lib/category-suggest-db", () => ({ loadCategoryHistory: vi.fn() }));
vi.mock("@/lib/ai-category", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai-category")>()),
  aiClient: vi.fn(),
  suggestWithAi: vi.fn(),
}));

import { isFeatureEnabled } from "@/config/features";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { loadAiCategories, loadTxnsForAi, saveAiCategories } from "@/lib/ai-category-db";
import { listCategoryNamesSafe } from "@/lib/transaction-categories-db";
import { loadCategoryHistory } from "@/lib/category-suggest-db";
import { aiClient, suggestWithAi, AI_CATEGORY_MODEL, AI_MAX_PER_REQUEST } from "@/lib/ai-category";
import { POST } from "@/app/api/accounting/ai-categories/route";

const post = (body: unknown) =>
  POST(
    new NextRequest("https://pmilighthouse.app/api/accounting/ai-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
const txn = (id: string) => ({ id, merchant: "X", description: "X", amount: 1, date: null });
const client = { fake: true };

beforeEach(() => {
  vi.mocked(isFeatureEnabled).mockReturnValue(true);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "admin@pmi.com", role: "admin" } as never);
  vi.mocked(aiClient).mockReturnValue(client as never);
  vi.mocked(loadAiCategories).mockResolvedValue({});
  vi.mocked(loadTxnsForAi).mockImplementation(async (_p, ids) => ids.map(txn));
  vi.mocked(listCategoryNamesSafe).mockResolvedValue(["Repairs", "Supplies"]);
  vi.mocked(loadCategoryHistory).mockResolvedValue([{ key: "homedepot", category: "Repairs", count: 3, latest: "" }]);
  vi.mocked(suggestWithAi).mockResolvedValue({});
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/accounting/ai-categories", () => {
  it("asks Claude only about transactions it hasn't answered yet, saves, and returns the guesses", async () => {
    vi.mocked(loadAiCategories).mockResolvedValue({ a: "Supplies", b: null });
    vi.mocked(suggestWithAi).mockResolvedValue({ c: "Repairs", d: null });
    const res = await post({ ids: ["a", "b", "c", "d"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: true, suggestions: { a: "Supplies", c: "Repairs" } });

    expect(loadTxnsForAi).toHaveBeenCalledWith({}, ["c", "d"]);
    const [usedClient, categories, examples, txns] = vi.mocked(suggestWithAi).mock.calls[0];
    expect(usedClient).toBe(client);
    expect(categories).toEqual(["Repairs", "Supplies"]);
    expect(examples).toEqual([{ merchant: "homedepot", categories: [{ category: "Repairs", count: 3 }] }]);
    expect(txns.map((t) => t.id)).toEqual(["c", "d"]);
    expect(saveAiCategories).toHaveBeenCalledWith({}, { c: "Repairs", d: null }, AI_CATEGORY_MODEL);
  });

  it("doesn't call Claude when everything asked about is already answered", async () => {
    vi.mocked(loadAiCategories).mockResolvedValue({ a: "Supplies" });
    await post({ ids: ["a"] });
    expect(suggestWithAi).not.toHaveBeenCalled();
  });

  it("says so (and calls nothing) when no Anthropic key is set", async () => {
    vi.mocked(aiClient).mockReturnValue(null);
    const res = await post({ ids: ["a"] });
    expect(await res.json()).toEqual({ configured: false, suggestions: {} });
    expect(suggestWithAi).not.toHaveBeenCalled();
  });

  it(`caps one request at ${AI_MAX_PER_REQUEST} ids and ignores junk`, async () => {
    const ids = Array.from({ length: AI_MAX_PER_REQUEST + 20 }, (_, i) => `t${i}`);
    await post({ ids: [...ids, 5, "", null, "t0"] });
    expect(vi.mocked(loadAiCategories).mock.calls[0][1]).toHaveLength(AI_MAX_PER_REQUEST);
  });

  it("400s without ids; 404s for someone without accounting access", async () => {
    expect((await post({})).status).toBe(400);
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "x@pmi.com", role: "user" } as never);
    expect((await post({ ids: ["a"] })).status).toBe(404);
  });
});
