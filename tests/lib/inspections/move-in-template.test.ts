import { describe, expect, it } from "vitest";
import {
  DEFAULT_BATHROOMS,
  DEFAULT_BEDROOMS,
  bathroomItems,
  bedroomItems,
  buildMoveInSections,
  defaultRooms,
  isMoveInType,
} from "@/lib/inspections/move-in-template";

describe("defaultRooms", () => {
  it("creates the default bedrooms and bathrooms with stable ids", () => {
    expect(defaultRooms("bed")).toHaveLength(DEFAULT_BEDROOMS);
    expect(defaultRooms("bath")).toEqual([
      { id: "bath1", label: "Bathroom 1" },
      { id: "bath2", label: "Bathroom 2" },
    ]);
    expect(DEFAULT_BATHROOMS).toBe(2);
  });
});

describe("room items", () => {
  it("namespaces item keys by the room id", () => {
    expect(bedroomItems("bed3").map((i) => i.key)).toContain("bed3.closets");
    expect(bathroomItems("bath2").every((i) => i.key.startsWith("bath2."))).toBe(true);
  });

  it("asks working/not-working for bathroom fixtures", () => {
    const sink = bathroomItems("bath1").find((i) => i.key === "bath1.sink")!;
    expect(sink.kind).toBe("working");
  });
});

describe("buildMoveInSections", () => {
  it("slots the default rooms between the fixed sections when meta has none", () => {
    const ids = buildMoveInSections(null).map((s) => s.id);
    expect(ids).toEqual([
      "general",
      "kitchen",
      "bath1",
      "bath2",
      "living",
      "bed1",
      "bed2",
      "bed3",
      "bed4",
      "laundry",
      "exterior",
      "frontyard",
      "backyard",
      "garage",
    ]);
  });

  it("uses the chosen rooms and their custom labels", () => {
    const sections = buildMoveInSections({
      bedrooms: [{ id: "bed1", label: "Primary — upstairs" }],
      bathrooms: [{ id: "bath1", label: "Hall bath" }],
    });
    expect(sections.find((s) => s.id === "bed1")!.title).toBe("Primary — upstairs");
    expect(sections.find((s) => s.id === "bath1")!.title).toBe("Hall bath");
    expect(sections.some((s) => s.id === "bed2")).toBe(false);
  });

  it("gives every item a unique key", () => {
    const keys = buildMoveInSections(null).flatMap((s) => s.items.map((i) => i.key));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("isMoveInType", () => {
  it("matches only move_in", () => {
    expect(isMoveInType("move_in")).toBe(true);
    expect(isMoveInType(" move_in ")).toBe(true);
    expect(isMoveInType("routine")).toBe(false);
    expect(isMoveInType(null)).toBe(false);
  });
});
