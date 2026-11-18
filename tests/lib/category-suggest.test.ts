import { describe, expect, it } from "vitest";
import { categoryHistoryFrom, matchMerchant, merchantKey, suggestCategories } from "@/lib/category-suggest";

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
    expect(merchantKey("", "CON EDISON")).toBe("conedison");
    expect(merchantKey("", "  ")).toBe("");
  });

  it("drops dates, reference codes, punctuation and spacing", () => {
    const k = merchantKey("", "HOME DEPOT");
    expect(merchantKey("", "HOMEDEPOT 11/14")).toBe(k);
    expect(merchantKey("", "HOME-DEPOT 2026-11-14 REF#A1B2C3")).toBe(k);
    expect(merchantKey("The Home Depot", "")).toBe(k);
  });

  it("drops card-processor prefixes and what follows a merchant's *", () => {
    expect(merchantKey("", "SQ *JOES PLUMBING")).toBe(merchantKey("", "JOES PLUMBING"));
    expect(merchantKey("", "TST* JOES DINER")).toBe(merchantKey("", "Joe's Diner"));
    expect(merchantKey("", "PAYPAL *ACMESUPPLY")).toBe(merchantKey("", "ACMESUPPLY"));
    expect(merchantKey("", "AMZN MKTP US*2K3L45XY")).toBe(merchantKey("", "AMZN MKTP US*9Q8W7E"));
  });

  it("drops bank boilerplate words", () => {
    expect(merchantKey("", "POS DEBIT PURCHASE LOWES")).toBe(merchantKey("Lowe's", ""));
    expect(merchantKey("", "ACME SUPPLY LLC")).toBe(merchantKey("Acme Supply Inc", ""));
  });
});

describe("matchMerchant (close but not identical)", () => {
  const known = ["homedepot", "conedison", "lowes", "acmesupply"];

  it("matches a store's description that adds a location", () => {
    expect(matchMerchant(merchantKey("", "HOME DEPOT ELMONT NY"), known)).toBe("homedepot");
  });

  it("matches a small misspelling", () => {
    expect(matchMerchant(merchantKey("", "HOME DEPTO"), known)).toBe("homedepot");
    expect(matchMerchant(merchantKey("", "CON EDISSON"), known)).toBe("conedison");
  });

  it("doesn't stretch short or unrelated names", () => {
    expect(matchMerchant(merchantKey("", "LOWE"), known)).toBeNull(); // too short to guess
    expect(matchMerchant(merchantKey("", "STAPLES"), known)).toBeNull();
    expect(matchMerchant("", known)).toBeNull();
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

  it("falls back to a close merchant name when there's no exact one", () => {
    const out = suggest([row("a", "", "", "2026-11-02", "HOME DEPOT 11/02 ELMONT NY"), row("b", "The Home Depot", "Repairs")]);
    expect(out).toEqual({ a: "Repairs" });
  });

    it("guesses nothing without a categorized row from that merchant, or a merchant at all", () => {
    expect(suggest([row("a", "Lowe's"), row("b", "Lowe's")])).toEqual({});
    expect(suggest([row("a", "", "", null, ""), row("b", "", "Repairs", null, "")])).toEqual({});
  });
});

describe("categoryHistoryFrom (older transactions, counted on the server)", () => {
  it("folds store numbers and spelling into one merchant / category, latest spelling wins", () => {
    const h = categoryHistoryFrom([
      { merchant: "HOMEDEPOT #6512", category: "repairs", n: 2, latest: "2025-01-01" },
      { merchant: "HOMEDEPOT #1003", category: "Repairs", n: 3, latest: "2025-06-01" },
      { merchant: "", category: "Repairs", n: 9, latest: null },
    ]);
    expect(h).toEqual([{ key: merchantKey("HOMEDEPOT", ""), category: "Repairs", count: 5, latest: "2025-06-01" }]);
  });
});

describe("suggestCategories with history", () => {
  const key = merchantKey("Home Depot", "");

  it("guesses from older transactions when nothing on screen has a category", () => {
    const out = suggestCategories([row("a", "Home Depot")], (r) => r.id, [{ key, category: "Supplies", count: 4, latest: "2025-03-01" }]);
    expect(out).toEqual({ a: "Supplies" });
  });

  it("adds the on-screen rows to the older counts", () => {
    const history = [{ key, category: "Supplies", count: 3, latest: "2025-03-01" }];
    const onScreen = [row("a", "Home Depot"), row("b", "Home Depot", "Repairs"), row("c", "Home Depot", "Repairs")];
    expect(suggestCategories(onScreen, (r) => r.id, history).a).toBe("Supplies");
    const more = [...onScreen, row("d", "Home Depot", "Repairs")];
    expect(suggestCategories(more, (r) => r.id, history).a).toBe("Repairs"); // 3 vs 3: most recent wins
  });
});
