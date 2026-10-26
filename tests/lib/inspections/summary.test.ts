import { describe, expect, it } from "vitest";
import { buildInspectionSummary } from "@/lib/inspections/summary";
import { check, inspection, property, workItem } from "./fixtures";

const input = (over: Partial<Parameters<typeof buildInspectionSummary>[0]> = {}) => ({
  inspection: inspection(),
  property,
  checklist: [] as ReturnType<typeof check>[],
  workItems: [] as ReturnType<typeof workItem>[],
  attachedPhotoCount: 0,
  ...over,
});

describe("buildInspectionSummary — routine inspection", () => {
  it("builds the subject from property and date", () => {
    expect(buildInspectionSummary(input()).subject).toBe("Inspection — 66 Francis Court — Oct 20, 2026");
  });

  it("counts issues in the checklist heading, ignoring N/A", () => {
    const { html } = buildInspectionSummary(
      input({
        checklist: [
          check({ status: "Issue found" }),
          check({ status: "OK", issue_notes: "Minor scuff" }),
          check({ status: "N/A" }),
          check({ status: "OK" }),
        ],
      })
    );
    expect(html).toContain("Checklist — 2 issues");
  });

  it("escapes user-entered text so it can't inject HTML into the email", () => {
    const { html } = buildInspectionSummary(
      input({
        inspection: inspection({ notes: '<img src=x onerror="alert(1)">' }),
        ownerMessage: "<script>steal()</script>",
      })
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;steal()&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("includes the owner message, special-instruction checklist, work items and photo count", () => {
    const { html } = buildInspectionSummary(
      input({
        ownerMessage: "All good this month.",
        inspection: inspection({ special_instructions: '[{"id":1,"name":"Check mail","checked":true}]' }),
        workItems: [workItem({ service_name: "Gutter cleaning", quantity: 2 })],
        attachedPhotoCount: 1,
      })
    );
    expect(html).toContain("All good this month.");
    expect(html).toContain("☑ Check mail");
    expect(html).toContain("Gutter cleaning");
    expect(html).toContain("×2");
    expect(html).toContain("1 photo attached");
  });

  it("says when no checklist was recorded", () => {
    expect(buildInspectionSummary(input()).html).toContain("No checklist recorded.");
  });
});

describe("buildInspectionSummary — move-in inspection", () => {
  const moveIn = inspection({
    inspection_type: "move_in",
    meta: {
      tenantNames: "Pamela Roberts",
      moveInDate: "2026-04-01",
      tenantSigName: "Pamela Roberts",
      tenantSigDate: "2026-04-01",
      bathrooms: [{ id: "bath1", label: "Hall bath" }],
    },
  });

  it("uses the move-in subject and header", () => {
    const { subject, html } = buildInspectionSummary(input({ inspection: moveIn }));
    expect(subject).toBe("Move-In Inspection — 66 Francis Court — Oct 20, 2026");
    expect(html).toContain("Pamela Roberts");
    expect(html).toContain("Apr 1, 2026");
  });

  it("shows only answered items, grouped under their room", () => {
    const { html } = buildInspectionSummary(
      input({
        inspection: moveIn,
        checklist: [
          check({ item_key: "bath1.sink", status: "No", issue_notes: "Slow drain" }),
          check({ item_key: "general.filter_size", status: "", issue_notes: "20x25x1" }),
        ],
      })
    );
    expect(html).toContain("Hall bath");
    expect(html).toContain("Condition: Slow drain");
    expect(html).toContain("20x25x1");
    expect(html).not.toContain("Condition: 20x25x1"); // value items show the raw value
    expect(html).not.toContain("Garage"); // section with no answers is omitted
  });

  it("includes typed signatures", () => {
    expect(buildInspectionSummary(input({ inspection: moveIn })).html).toContain("Signatures");
  });
});
