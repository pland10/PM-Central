import pkg from "../../package.json";

// Version shown at the bottom of the sidebar: the package version plus the short
// commit of the running deploy, so anyone can tell which build they're on. Both
// hosts expose the commit at runtime (Vercel: VERCEL_GIT_COMMIT_SHA, Railway:
// RAILWAY_GIT_COMMIT_SHA); locally there's none, so it's just the version.
export function appVersion(env: Record<string, string | undefined> = process.env): string {
  const sha = (env.VERCEL_GIT_COMMIT_SHA || env.RAILWAY_GIT_COMMIT_SHA || "").trim();
  return sha ? `v${pkg.version} · ${sha.slice(0, 7)}` : `v${pkg.version}`;
}
