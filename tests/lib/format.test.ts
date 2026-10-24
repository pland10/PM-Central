import { describe, expect, it } from "vitest";
import { formatAddress, formatCurrency } from "@/lib/format";

describe("formatCurrency", () => {
  it("formats whole US dollars with separators", () => {
    expect(formatCurrency(5050)).toBe("$5,050");
    expect(formatCurrency(0)).toBe("$0");
  });

  it("rounds to whole dollars", () => {
    expect(formatCurrency(1234.4)).toBe("$1,234");
    expect(formatCurrency(1234.6)).toBe("$1,235");
  });

  it("formats negatives", () => {
    expect(formatCurrency(-25)).toBe("-$25");
  });

  it("renders a dash for missing values", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
  });
});

describe("formatAddress", () => {
  const base = { street1: "66 Francis Court", city: "Elmont", state: "NY", zip: "11003" };

  it("joins street, city, state and zip", () => {
    expect(formatAddress(base)).toBe("66 Francis Court, Elmont, NY 11003");
  });

  it("includes street2 when present", () => {
    expect(formatAddress({ ...base, street2: "Apt 2" })).toBe("66 Francis Court, Apt 2, Elmont, NY 11003");
  });

  it("skips an empty or null street2", () => {
    expect(formatAddress({ ...base, street2: "" })).toBe("66 Francis Court, Elmont, NY 11003");
    expect(formatAddress({ ...base, street2: null })).toBe("66 Francis Court, Elmont, NY 11003");
  });
});
