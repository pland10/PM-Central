import { describe, expect, it } from "vitest";
import { buildPropertyChoices } from "@/lib/property-options";

const props = [
  { externalId: "48", label: "8204 138th Street · Jamaica" },
  { externalId: "12", label: "66 Francis Court · Elmont" },
];
const units = [
  { unitId: "45", propertyExternalId: "48", name: "Unit 1" },
  { unitId: "46", propertyExternalId: "48", name: "Unit 2" },
  { unitId: "90", propertyExternalId: "12", name: "Main" }, // single-unit property
];

describe("buildPropertyChoices", () => {
  it("offers the building plus each unit for multi-unit properties, and just the property otherwise", () => {
    expect(buildPropertyChoices(props, units)).toEqual([
      { label: "8204 138th Street · Jamaica", propertyId: "48", unitId: null },
      { label: "8204 138th Street · Jamaica — Unit 1", propertyId: "48", unitId: "45" },
      { label: "8204 138th Street · Jamaica — Unit 2", propertyId: "48", unitId: "46" },
      { label: "66 Francis Court · Elmont", propertyId: "12", unitId: null },
    ]);
  });

  it("makes repeated labels unique", () => {
    const dupes = [
      { externalId: "1", label: "1 Main St · Town" },
      { externalId: "2", label: "1 Main St · Town" },
    ];
    expect(buildPropertyChoices(dupes, []).map((c) => c.label)).toEqual(["1 Main St · Town (#1)", "1 Main St · Town (#2)"]);
  });
});
