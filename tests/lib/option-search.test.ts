import { describe, expect, it } from "vitest";
import { searchOptions } from "@/lib/option-search";

const PROPS = [
  "1 Thornton St · Patchogue",
  "10 Osborne Lane · Greenvale",
  "109 Chase Road · Manhasset",
  "115 8th Avenue · Huntington Station",
  "15 Canyon Street · Huntington",
  "21 Cleveland st apt 1 · Valley Stream",
  "61 Mill Lane · Huntington",
  "8204 138th Street · Jamaica",
  "8204 138th Street · Jamaica — Unit 1",
  "8204 138th Street · Jamaica — Unit 2",
];

describe("searchOptions", () => {
  it("caps results and reports how many more matched", () => {
    const r = searchOptions(PROPS, "1", 3);
    expect(r.items).toHaveLength(3);
    expect(r.more).toBe(r.total - 3);
    expect(r.total).toBeGreaterThan(3);
  });

  it("ranks label-start matches before word-start before anywhere", () => {
    const r = searchOptions(PROPS, "1", 50);
    // starts with "1" first, in list order
    expect(r.items.slice(0, 5)).toEqual([
      "1 Thornton St · Patchogue",
      "10 Osborne Lane · Greenvale",
      "109 Chase Road · Manhasset",
      "115 8th Avenue · Huntington Station",
      "15 Canyon Street · Huntington",
    ]);
    // then a word starting with "1" (138th, apt 1). A 1–2 character term must
    // start a word, so "61 Mill Lane" (1 only mid-number) isn't a match.
    expect(r.items).toContain("8204 138th Street · Jamaica");
    expect(r.items).toContain("21 Cleveland st apt 1 · Valley Stream");
    expect(r.items).not.toContain("61 Mill Lane · Huntington");
  });

  it("matches 3+ character terms anywhere, ranked after word-start matches", () => {
    const r = searchOptions(["Westbury", "Bury St"], "bury", 10);
    expect(r.items).toEqual(["Bury St", "Westbury"]);
  });

  it("requires every typed word to match, in any order, ignoring case", () => {
    expect(searchOptions(PROPS, "huntington lane", 10).items).toEqual(["61 Mill Lane · Huntington"]);
    expect(searchOptions(PROPS, "JAMAICA unit 2", 10).items).toEqual(["8204 138th Street · Jamaica — Unit 2"]);
  });

  it("returns the first N in list order for an empty query", () => {
    const r = searchOptions(PROPS, "  ", 4);
    expect(r.items).toEqual(PROPS.slice(0, 4));
    expect(r.total).toBe(PROPS.length);
  });

  it("returns nothing for no match", () => {
    expect(searchOptions(PROPS, "zzz", 10)).toEqual({ items: [], total: 0, more: 0 });
  });
});
