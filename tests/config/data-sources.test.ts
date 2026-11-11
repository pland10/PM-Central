import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DATA_SOURCES, getDataSource } from "@/config/data-sources";

describe("DATA_SOURCES", () => {
  it("points every PM-Central source at a workflow file that exists", () => {
    for (const s of DATA_SOURCES.filter((d) => d.dispatch.repo === "PM-Central")) {
      expect(existsSync(join(__dirname, "..", "..", ".github", "workflows", s.dispatch.workflow)), s.id).toBe(true);
    }
  });

  it("syncs Rentvine bill lines every 2h for the Accounting billed-in-Rentvine check", () => {
    const s = getDataSource("rentvine_bills");
    expect(s).toMatchObject({
      tier: "hourly",
      jobs: ["rentvine_bill_charges"],
      dispatch: { repo: "PM-Central", workflow: "sync-rentvine-bills.yml" },
    });
  });
});
