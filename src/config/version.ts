import pkg from "../../package.json";

// Version shown at the bottom of the sidebar, e.g. "v1.0.233 · 5cbb516".
//
// The last number is the release: production deploys are merge commits of a
// promotion PR ("Merge pull request #233 from …"), and PR numbers only go up, so
// the version counts up on its own every release — no manual bump. Major.minor
// come from package.json. After the dot is the short commit, to pin the exact
// build. Both hosts expose these at runtime (Vercel: VERCEL_GIT_COMMIT_SHA /
// _MESSAGE, Railway: RAILWAY_GIT_COMMIT_SHA / _MESSAGE). A deploy that isn't a
// PR merge falls back to the package version; locally there's no commit.
export function appVersion(env: Record<string, string | undefined> = process.env): string {
  const sha = (env.VERCEL_GIT_COMMIT_SHA || env.RAILWAY_GIT_COMMIT_SHA || "").trim();
  const message = env.VERCEL_GIT_COMMIT_MESSAGE || env.RAILWAY_GIT_COMMIT_MESSAGE || "";
  const pr = /^Merge pull request #(\d+)\b/.exec(message.trim())?.[1];
  const [major, minor] = pkg.version.split(".");
  const version = pr ? `v${major}.${minor}.${pr}` : `v${pkg.version}`;
  return sha ? `${version} · ${sha.slice(0, 7)}` : version;
}
