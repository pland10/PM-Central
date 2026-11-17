import { describe, expect, it } from "vitest";
import { merchantKey, suggestCategories } from "@/lib/category-suggest";

type R = { id: string; merchantName: string; name: string; categoryOverride: string; postedDate: string | null };
const row = (id: string, merchantName: string, categoryOverride = "", postedDate: string | null = "2026-11-01", name = ""): R => ({
  id,
  merchantName,
  name,
  categoryOverride,
  postedDate,
});
const suggest = (rows: R[]) => suggestCategories(rows, (r) => r.id);

describe("merchantKey", () => {
  it("ignores case, spacing and store numbers", () => {
    expect(merchantKey("The Home Depot", "")).toBe(merchantKey("THE HOME  DEPOT", ""));
    expect(merchantKey("", "HOMEDEPOT #6512")).toBe(merchantKey("", "HOMEDEPOT #1003"));
  });

  it("uses the bank description when there's no merchant", () => {
    expect(merchantKey("", "CON ED OF NY")).toBe("con ed of ny");
    expect(merchantKey("", "  ")).toBe("");
  });
});

describe("suggestCategories", () => {
  it("guesses an uncategorized row's category from the same merchant's other rows", () => {
    const out = suggest([row("a", "Lowe's"), row("b", "Lowe's", "Repairs"), row("c", "Con Ed", "Utilities")]);
    expect(out).toEqual({ a: "Repairs" });
  });

  it("picks the merchant's most used category", () => {
    const out = suggest([
      row("a", "Home Depot"),
      row("b", "Home Depot", "Supplies", "2026-10-01"),
      row("c", "Home Depot", "Repairs", "2026-10-05"),
      row("d", "Home Depot", "Supplies", "2026-09-01"),
    ]);
    expect(out.a).toBe("Supplies");
  });

  it("breaks a tie with the most recent one", () => {
    const out = suggest([
      row("a", "Home Depot"),
      row("b", "Home Depot", "Supplies", "2026-09-01"),
      row("c", "Home Depot", "Repairs", "2026-10-05"),
    ]);
    expect(out.a).toBe("Repairs");
  });

  it("counts spellings that differ only in case as one category", () => {
    const out = suggest([
      row("a", "Home Depot"),
      row("b", "Home Depot", "repairs", "2026-09-01"),
      row("c", "Home Depot", "Repairs", "2026-09-02"),
      row("d", "Home Depot", "Supplies", "2026-10-05"),
    ]);
    expect(out.a).toBe("Repairs");
  });

  it("guesses nothing without a categorized row from that merchant, or a merchant at all", () => {
    expect(suggest([row("a", "Lowe's"), row("b", "Lowe's")])).toEqual({});
    expect(suggest([row("a", "", "", null, ""), row("b", "", "Repairs", null, "")])).toEqual({});
  });
});
