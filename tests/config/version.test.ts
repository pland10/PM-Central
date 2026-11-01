import { describe, expect, it } from "vitest";
import { appVersion } from "@/config/version";
import pkg from "../../package.json";

const [major, minor] = pkg.version.split(".");
const MERGE = "Merge pull request #233 from pland10/dev\n\nPromote dev → main: Refresh shows live run status";

describe("appVersion", () => {
  it("uses the release's PR number as the last part, so it counts up every release (Vercel)", () => {
    expect(
      appVersion({ VERCEL_GIT_COMMIT_SHA: "5cbb51607ffc0c17b42a95e9940c3bbe92d0f499", VERCEL_GIT_COMMIT_MESSAGE: MERGE })
    ).toBe(`v${major}.${minor}.233 · 5cbb516`);
  });

  it("reads Railway's commit and message when not on Vercel", () => {
    expect(
      appVersion({
        RAILWAY_GIT_COMMIT_SHA: "0d7af1eb8059a7bd0c375b15e25d722ed1458054",
        RAILWAY_GIT_COMMIT_MESSAGE: "Merge pull request #232 from pland10/claude/x",
      })
    ).toBe(`v${major}.${minor}.232 · 0d7af1e`);
  });

  it("falls back to the package version when the deploy isn't a PR merge", () => {
    expect(appVersion({ VERCEL_GIT_COMMIT_SHA: "ddd7f047f577", VERCEL_GIT_COMMIT_MESSAGE: "Fix typo" })).toBe(
      `v${pkg.version} · ddd7f04`
    );
  });

  it("is just the package version locally (no commit)", () => {
    expect(appVersion({})).toBe(`v${pkg.version}`);
  });
});
