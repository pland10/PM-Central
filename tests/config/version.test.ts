import { describe, expect, it } from "vitest";
import { appVersion } from "@/config/version";
import pkg from "../../package.json";

describe("appVersion", () => {
  it("shows the package version plus the short commit of the deploy (Vercel)", () => {
    expect(appVersion({ VERCEL_GIT_COMMIT_SHA: "ddd7f047f577093675157de9386af7797cfec92e" })).toBe(
      `v${pkg.version} · ddd7f04`
    );
  });

  it("uses Railway's commit when not on Vercel", () => {
    expect(appVersion({ RAILWAY_GIT_COMMIT_SHA: "a89243de2e839e9e755d7c50edb84d44b89f36bf" })).toBe(
      `v${pkg.version} · a89243d`
    );
  });

  it("is just the package version locally (no commit)", () => {
    expect(appVersion({})).toBe(`v${pkg.version}`);
  });
});
