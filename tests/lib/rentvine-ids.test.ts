import { describe, expect, it } from "vitest";
import { rentvinePropertyId } from "@/lib/rentvine-ids";

describe("rentvinePropertyId", () => {
  it("takes the Rentvine id off a namespaced Property.externalId, and leaves a bare id alone", () => {
    expect(rentvinePropertyId("pmilighthouse:property:48")).toBe("48");
    expect(rentvinePropertyId("48")).toBe("48");
    expect(rentvinePropertyId(null)).toBe("");
  });
});
