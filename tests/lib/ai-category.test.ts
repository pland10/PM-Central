import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  AI_BATCH_SIZE,
  AI_CATEGORY_MODEL,
  aiExamplesFrom,
  parseAiAnswer,
  suggestWithAi,
  type AiTxn,
} from "@/lib/ai-category";

const txn = (id: string, over: Partial<AiTxn> = {}): AiTxn => ({
  id,
  merchant: "HOME DEPOT 11/02 ELMONT NY",
  description: "HOMEDEPOT #6512",
  amount: 84.12,
  date: "2026-11-02",
  ...over,
});
const CATEGORIES = ["Repairs", "Supplies", "Utilities"];

function fakeClient(reply: { text?: string; stop_reason?: string } | Error) {
  const create = vi.fn(async () => {
    if (reply instanceof Error) throw reply;
    return {
      stop_reason: reply.stop_reason ?? "end_turn",
      content: [{ type: "thinking", thinking: "" }, { type: "text", text: reply.text ?? "" }],
    };
  });
  return { client: { beta: { messages: { create } } } as unknown as Anthropic, create };
}

describe("aiExamplesFrom", () => {
  it("lists each merchant's categories, most used first, busiest merchants first", () => {
    const out = aiExamplesFrom([
      { key: "lowes", category: "Supplies", count: 2, latest: "2025-01-01" },
      { key: "homedepot", category: "Supplies", count: 3, latest: "2025-01-01" },
      { key: "homedepot", category: "Repairs", count: 9, latest: "2025-01-01" },
    ]);
    expect(out).toEqual([
      { merchant: "homedepot", categories: [{ category: "Repairs", count: 9 }, { category: "Supplies", count: 3 }] },
      { merchant: "lowes", categories: [{ category: "Supplies", count: 2 }] },
    ]);
  });

  it("caps how many it sends", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ key: `m${i}`, category: "Repairs", count: i + 1, latest: "" }));
    expect(aiExamplesFrom(many, 10)).toHaveLength(10);
  });
});

describe("parseAiAnswer", () => {
  it("keeps only categories from the list (any case → the list's spelling) for the ids asked about", () => {
    const text = JSON.stringify({
      suggestions: [
        { id: "a", category: "repairs" },
        { id: "b", category: "Snacks" }, // not an approved category
        { id: "c", category: "" }, // no confident guess
        { id: "zzz", category: "Supplies" }, // never asked about
      ],
    });
    expect(parseAiAnswer(text, CATEGORIES, ["a", "b", "c", "d"])).toEqual({ a: "Repairs", b: null, c: null, d: null });
  });

  it("returns null for an answer that isn't the expected JSON", () => {
    expect(parseAiAnswer("not json", CATEGORIES, ["a"])).toBeNull();
    expect(parseAiAnswer(JSON.stringify({ nope: [] }), CATEGORIES, ["a"])).toBeNull();
  });
});

describe("suggestWithAi", () => {
  it("asks Claude once per batch, with the category list, the examples and the transactions, in a fixed JSON shape", async () => {
    const { client, create } = fakeClient({ text: JSON.stringify({ suggestions: [{ id: "a", category: "Repairs" }] }) });
    const out = await suggestWithAi(client, CATEGORIES, [{ merchant: "homedepot", categories: [{ category: "Repairs", count: 9 }] }], [
      txn("a"),
    ]);
    expect(out).toEqual({ a: "Repairs" });

    expect(create).toHaveBeenCalledTimes(1);
    const params = (create.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(params.model).toBe(AI_CATEGORY_MODEL);
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
    const system = JSON.stringify(params.system);
    expect(system).toContain("Repairs");
    expect(system).toContain("homedepot");
    const user = JSON.stringify(params.messages);
    expect(user).toContain("HOMEDEPOT #6512");
    expect(user).toContain("84.12");
  });

  it("splits a long list into batches", async () => {
    const { client, create } = fakeClient({ text: JSON.stringify({ suggestions: [] }) });
    const txns = Array.from({ length: AI_BATCH_SIZE + 1 }, (_, i) => txn(`t${i}`));
    const out = await suggestWithAi(client, CATEGORIES, [], txns);
    expect(create).toHaveBeenCalledTimes(2);
    expect(Object.keys(out)).toHaveLength(AI_BATCH_SIZE + 1); // all asked about, none guessed
    expect(Object.values(out).every((v) => v === null)).toBe(true);
  });

  it("leaves out a batch that failed or was declined, so it's tried again later", async () => {
    const { client: failing } = fakeClient(new Error("overloaded"));
    expect(await suggestWithAi(failing, CATEGORIES, [], [txn("a")])).toEqual({});
    const { client: declined } = fakeClient({ stop_reason: "refusal" });
    expect(await suggestWithAi(declined, CATEGORIES, [], [txn("a")])).toEqual({});
  });

  it("doesn't call Claude without a category list or transactions", async () => {
    const { client, create } = fakeClient({ text: "{}" });
    expect(await suggestWithAi(client, [], [], [txn("a")])).toEqual({});
    expect(await suggestWithAi(client, CATEGORIES, [], [])).toEqual({});
    expect(create).not.toHaveBeenCalled();
  });
});
