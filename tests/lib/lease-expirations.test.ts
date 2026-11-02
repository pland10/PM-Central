import { describe, expect, it } from "vitest";
import { expirationBuckets } from "@/lib/lease-expirations";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-02T12:00:00Z");
const inDays = (d: number) => NOW + d * DAY;

describe("expirationBuckets", () => {
  it("counts dated leases into expired, 0–30, 31–60, 61–90 and 90+ days", () => {
    const ends = [-247, -2, 0, 28, 30, 31, 60, 61, 90, 91, 400].map(inDays);
    expect(expirationBuckets(ends, NOW)).toEqual({
      expired: 2,
      d0to30: 3,
      d31to60: 2,
      d61to90: 2,
      d90plus: 2,
    });
  });

  it("rounds to whole days the way the list's 'in Nd' label does", () => {
    // 30.4 days out shows "in 30d", so it belongs in 0–30; 30.6 shows "in 31d".
    expect(expirationBuckets([inDays(30.4)], NOW).d0to30).toBe(1);
    expect(expirationBuckets([inDays(30.6)], NOW).d31to60).toBe(1);
    // Earlier today rounds to "today", not expired.
    expect(expirationBuckets([inDays(-0.2)], NOW).d0to30).toBe(1);
  });

  it("is all zeros with no leases", () => {
    expect(expirationBuckets([], NOW)).toEqual({ expired: 0, d0to30: 0, d31to60: 0, d61to90: 0, d90plus: 0 });
  });
});
