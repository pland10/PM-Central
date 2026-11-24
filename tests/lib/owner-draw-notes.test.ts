import { describe, expect, it } from "vitest";
import { ownerDrawNoteEmail } from "@/lib/owner-draw-notes";

describe("ownerDrawNoteEmail", () => {
  it("names the owner and month, escapes the note, links to that month", () => {
    const m = ownerDrawNoteEmail({
      name: "Grant <Holdings>",
      month: "2026-11",
      author: "JR",
      body: "Sent first half\n<b>$1,037</b>",
      appUrl: "https://pmilighthouse.app/accounting/owner-draws?month=2026-11",
    });
    expect(m.subject).toBe("Owner draw note · Grant <Holdings> · November 2026");
    expect(m.html).toContain("Grant &lt;Holdings&gt;");
    expect(m.html).toContain("Sent first half<br>&lt;b&gt;$1,037&lt;/b&gt;");
    expect(m.html).toContain('href="https://pmilighthouse.app/accounting/owner-draws?month=2026-11"');
  });
});
