import { describe, expect, it } from "vitest";
import { STAGE_ORDER, isTerminal, pipelineRank, priorityRank } from "@/lib/work-orders";

describe("pipelineRank", () => {
  it("ranks known stages by their pipeline position", () => {
    STAGE_ORDER.forEach((stage, i) => expect(pipelineRank(stage)).toBe(i));
  });

  it("ranks unknown stages below every known stage", () => {
    expect(pipelineRank("Something new")).toBe(-1);
    expect(pipelineRank("Something new")).toBeLessThan(pipelineRank(STAGE_ORDER[0]));
  });

  it("sorts latest stage first when used descending", () => {
    const sorted = ["New WO", "Invoice Received", "Troubleshooting", "??"].sort(
      (a, b) => pipelineRank(b) - pipelineRank(a)
    );
    expect(sorted).toEqual(["Invoice Received", "Troubleshooting", "New WO", "??"]);
  });
});

describe("isTerminal", () => {
  it.each(["Completed", "Cancelled", "Canceled", "Closed", "Lost", "Deferred", "closed - no action"])(
    "treats %s as terminal",
    (stage) => expect(isTerminal(stage)).toBe(true)
  );

  it.each(["New WO", "Troubleshooting", "Assigning in Progress", "Scheduling in Progress"])(
    "treats %s as open",
    (stage) => expect(isTerminal(stage)).toBe(false)
  );

  // Current behavior, recorded on purpose: the stage-name regex matches
  // "complete", so this mid-pipeline stage counts as closed while the LATER
  // "Invoice Received" stage counts as open. Open question with the user —
  // change this test first if the rule changes.
  it("counts 'Work Completed - Awaiting Invoice' as terminal but 'Invoice Received' as open", () => {
    expect(isTerminal("Work Completed - Awaiting Invoice")).toBe(true);
    expect(isTerminal("Invoice Received")).toBe(false);
  });
});

describe("priorityRank", () => {
  it("orders High > Medium > Low > anything else", () => {
    expect(priorityRank("High")).toBeGreaterThan(priorityRank("Medium"));
    expect(priorityRank("Medium")).toBeGreaterThan(priorityRank("Low"));
    expect(priorityRank("Low")).toBeGreaterThan(priorityRank(""));
    expect(priorityRank("Urgent")).toBe(0);
  });
});
