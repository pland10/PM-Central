import type { DataSource } from "@/config/data-sources";

// Trigger a data source's GitHub Actions workflow (workflow_dispatch). Shared by
// the admin Refresh button (src/app/api/admin/refresh) and the external
// scheduler endpoint (src/app/api/cron/sync). Needs GITHUB_DISPATCH_TOKEN — a
// fine-grained token with Actions: write on the target repos.

export type DispatchResult =
  | { source: string; ok: true }
  | { source: string; ok: false; status: number; error: string };

export function hasDispatchToken(): boolean {
  return Boolean(process.env.GITHUB_DISPATCH_TOKEN);
}

export async function dispatchSource(source: DataSource): Promise<DispatchResult> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return { source: source.id, ok: false, status: 503, error: "GITHUB_DISPATCH_TOKEN not set." };
  }
  const { owner, repo, workflow, ref } = source.dispatch;
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref }),
    });
    if (res.status === 204) return { source: source.id, ok: true };
    const text = await res.text().catch(() => "");
    return {
      source: source.id,
      ok: false,
      status: 502,
      error: `GitHub dispatch failed (HTTP ${res.status}). ${text.slice(0, 300)}`,
    };
  } catch (e) {
    return {
      source: source.id,
      ok: false,
      status: 502,
      error: e instanceof Error ? e.message : "Dispatch request failed.",
    };
  }
}

// Dispatch several sources, de-duplicated by their underlying workflow — two
// sources backed by the same workflow (e.g. communications + payments both run
// leadsimple-search/sync.yml) fire that workflow once, not twice.
export async function dispatchSources(sources: DataSource[]): Promise<DispatchResult[]> {
  const byWorkflow = new Map<string, DataSource>();
  for (const s of sources) {
    if (s.comingSoon) continue;
    const { owner, repo, workflow, ref } = s.dispatch;
    const key = `${owner}/${repo}/${workflow}@${ref}`;
    if (!byWorkflow.has(key)) byWorkflow.set(key, s);
  }
  return Promise.all([...byWorkflow.values()].map(dispatchSource));
}
