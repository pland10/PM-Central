import { describe, expect, it } from "vitest";
import { buildWorkOrderDescription } from "@/lib/inspections/work-order-text";
import { check, inspection, property, workItem } from "./fixtures";

const detail = (over: Partial<Parameters<typeof buildWorkOrderDescription>[0]> = {}) => ({
  inspection: inspection(),
  property,
  checklist: [],
  photos: [],
  workItems: [],
  ...over,
});

describe("buildWorkOrderDescription", () => {
  it("opens with the property and inspection date", () => {
    expect(buildWorkOrderDescription(detail())).toBe("From inspection of 66 Francis Court on Oct 20, 2026.");
  });

  it("lists only real issues — not OK or N/A items", () => {
    const text = buildWorkOrderDescription(
      detail({
        checklist: [
          check({ item_label: "Water / Leaks", status: "Issue found", issue_notes: "Drip under sink" }),
          check({ item_label: "Exterior", status: "OK" }),
          check({ item_label: "Mail", status: "N/A", issue_notes: "n/a for this house" }),
          check({ item_label: "HVAC", status: "OK", issue_notes: "Filter is dirty" }), // a note counts as an issue
        ],
      })
    );

    expect(text).toContain("Issues found:\n- Water / Leaks: Drip under sink\n- HVAC: Filter is dirty");
    expect(text).not.toContain("Exterior");
    expect(text).not.toContain("Mail");
  });

  it("lists work items with quantity and notes, then the inspection notes", () => {
    const text = buildWorkOrderDescription(
      detail({
        inspection: inspection({ notes: "Owner asked for photos" }),
        workItems: [workItem({ service_name: "Gutter cleaning", quantity: 2, notes: "front + back" }), workItem()],
      })
    );

    expect(text).toContain("Work items:\n- Gutter cleaning ×2 — front + back\n- Lawn mowing");
    expect(text.endsWith("Notes: Owner asked for photos")).toBe(true);
  });

  it("falls back when the property or date is unknown", () => {
    expect(buildWorkOrderDescription(detail({ property: null, inspection: inspection({ inspection_date: null }) }))).toBe(
      "From inspection of property."
    );
  });
});
