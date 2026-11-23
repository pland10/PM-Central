import { afterEach, describe, expect, it, vi } from "vitest";
import { sqlOf } from "../helpers/sql";

const queryRaw = vi.fn(async (_q: unknown) => [] as unknown[]);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (q: unknown) => queryRaw(q),
    $executeRawUnsafe: vi.fn(async () => 0),
  },
}));

import { searchActivities, type SearchFilters } from "@/lib/search-db";

afterEach(() => vi.clearAllMocks());

const f = (over: Partial<SearchFilters> = {}): SearchFilters => ({
  q: "",
  dir: "",
  taskStatus: "",
  types: ["text"],
  contacts: [],
  property: "",
  pipeline: "",
  ...over,
});
const last = () => queryRaw.mock.calls.at(-1)![0] as { values: unknown[] };

describe("search scope: several contact names", () => {
  it("matches any of the chosen names (the same person under different names)", async () => {
    await searchActivities(f({ contacts: ["Shiv Patel", "Shiv P", "Shivkumar Patel"] }), 0, 20);
    const sql = sqlOf(last());
    expect(sql.match(/contact_names ILIKE/g)).toHaveLength(3);
    expect(sql).toMatch(/\(contact_names ILIKE \? OR contact_names ILIKE \? OR contact_names ILIKE \?\)/);
    expect(last().values).toEqual(expect.arrayContaining(["%Shiv Patel%", "%Shiv P%", "%Shivkumar Patel%"]));
  });

  it("still ORs the contacts with a property, and ignores blanks", async () => {
    await searchActivities(f({ contacts: ["Ann", "  "], property: "66 Francis" }), 0, 20);
    const sql = sqlOf(last());
    expect(sql.match(/contact_names ILIKE/g)).toHaveLength(1);
    expect(sql).toMatch(/\(contact_names ILIKE \? OR property_address ILIKE \?\)/);
  });

  it("adds no contact filter when none are chosen", async () => {
    await searchActivities(f(), 0, 20);
    expect(sqlOf(last())).not.toMatch(/contact_names ILIKE/);
  });
});
