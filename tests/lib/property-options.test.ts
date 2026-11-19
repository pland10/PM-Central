import { afterEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { property: { findMany: (...a: unknown[]) => findMany(...a) } } }));

import { listPropertyOptions, propertyLabelMap } from "@/lib/property-options";

afterEach(() => vi.clearAllMocks());

const rows = [
  { externalId: "pmi:property:22", name: null, street1: "10 Park Ct", city: "Lynbrook", status: "inactive" },
  { externalId: "pmi:property:5", name: null, street1: "1 Main St", city: "Elmont", status: "active" },
  { externalId: "pmi:property:9", name: "Zeta House", street1: "9 Elm", city: null, status: "active" },
];

describe("listPropertyOptions", () => {
  it("includes former clients (inactive), marked and listed after the active ones", async () => {
    findMany.mockResolvedValue(rows);
    expect(await listPropertyOptions()).toEqual([
      { externalId: "pmi:property:5", label: "1 Main St · Elmont" },
      { externalId: "pmi:property:9", label: "Zeta House" },
      { externalId: "pmi:property:22", label: "10 Park Ct · Lynbrook (inactive)" },
    ]);
    const where = findMany.mock.calls[0][0].where;
    expect(where).toEqual({ externalId: { not: null } }); // no status filter
  });

  it("labels an inactive property's existing records too", async () => {
    findMany.mockResolvedValue(rows);
    expect((await propertyLabelMap())["pmi:property:22"]).toBe("10 Park Ct · Lynbrook (inactive)");
  });
});
