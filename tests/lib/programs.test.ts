import { describe, expect, it } from "vitest";
import { SQUATTER_WATCH, hasTag, isSquatterWatch, parseTags, tagSlug } from "@/lib/programs";

describe("tagSlug", () => {
  it.each(["Squatter Watch", "squatterwatch", "Squatter-Watch", "SQUATTER_WATCH"])(
    "normalizes %s to the same slug",
    (name) => expect(tagSlug(name)).toBe(SQUATTER_WATCH)
  );
});

describe("parseTags", () => {
  it("splits, trims and drops empties", () => {
    expect(parseTags(" squatterwatch , vip ,, ")).toEqual(["squatterwatch", "vip"]);
  });

  it("returns [] for null, undefined or empty", () => {
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags("")).toEqual([]);
  });
});

describe("hasTag / isSquatterWatch", () => {
  it("matches whole slugs only", () => {
    expect(hasTag("squatterwatch,vip", "vip")).toBe(true);
    expect(hasTag("squatterwatchx", SQUATTER_WATCH)).toBe(false);
  });

  it("detects Squatter Watch properties", () => {
    expect(isSquatterWatch("vip, squatterwatch")).toBe(true);
    expect(isSquatterWatch("vip")).toBe(false);
    expect(isSquatterWatch(null)).toBe(false);
  });
});
