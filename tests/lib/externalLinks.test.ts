import { describe, expect, it } from "vitest";
import { externalLink } from "@/lib/externalLinks";

describe("externalLink", () => {
  it.each([
    ["pmilighthouse:property:12", "https://pmilighthouse.rentvine.com/properties/12"],
    ["pmilighthouse:unit:7", "https://pmilighthouse.rentvine.com/units/7"],
    ["pmilighthouse:lease:27", "https://pmilighthouse.rentvine.com/leases/27"],
    ["pmilighthouse:wo:301", "https://pmilighthouse.rentvine.com/maintenance/work-orders/301"],
    ["pmilighthouse:portfolio:3", "https://pmilighthouse.rentvine.com/portfolios/3"],
  ])("builds the Rentvine URL for %s", (externalId, url) => {
    expect(externalLink("rentvine", externalId)).toEqual({ label: "Rentvine", url });
  });

  it("uses the account segment as the subdomain", () => {
    expect(externalLink("rentvine", "othercompany:lease:1")?.url).toBe(
      "https://othercompany.rentvine.com/leases/1"
    );
  });

  it("returns null for unknown types, malformed ids, other sources, or no id", () => {
    expect(externalLink("rentvine", "pmilighthouse:tenant:1")).toBeNull();
    expect(externalLink("rentvine", "pmilighthouse:property")).toBeNull();
    expect(externalLink("leadsimple", "pmilighthouse:property:1")).toBeNull();
    expect(externalLink("rentvine", null)).toBeNull();
  });
});
