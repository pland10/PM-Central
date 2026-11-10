import { describe, expect, it } from "vitest";
import { BRAND } from "@/config/brand";

describe("BRAND", () => {
  it("calls the app PM Central (not 'Property Management Hub')", () => {
    expect(BRAND.tagline).toBe("PM Central");
  });
});
