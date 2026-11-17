import { describe, expect, it } from "vitest";
import { parseClosedSections, serializeClosedSections, sectionId } from "@/lib/sidebar";

describe("sidebar section state", () => {
  it("turns a heading into a stable id", () => {
    expect(sectionId("Property Data")).toBe("property-data");
    expect(sectionId("Admin")).toBe("admin");
  });
  it("parses the closed-sections cookie, ignoring junk", () => {
    expect(parseClosedSections(undefined)).toEqual([]);
    expect(parseClosedSections("")).toEqual([]);
    expect(parseClosedSections("property-data,admin")).toEqual(["property-data", "admin"]);
    expect(parseClosedSections("property-data,,BAD id!,property-data")).toEqual(["property-data"]);
  });
  it("round-trips", () => {
    expect(parseClosedSections(serializeClosedSections(["admin", "property-data"]))).toEqual(["admin", "property-data"]);
  });
});
