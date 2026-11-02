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
  const { owner, repo, workflow, ref, inputs } = source.dispatch;
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
      body: JSON.stringify(inputs ? { ref, inputs } : { ref }),
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
    const { owner, repo, workflow, ref, inputs } = s.dispatch;
    // Same workflow + ref but different inputs (e.g. mode) is a distinct run.
    const key = `${owner}/${repo}/${workflow}@${ref}:${JSON.stringify(inputs ?? null)}`;
    if (!byWorkflow.has(key)) byWorkflow.set(key, s);
  }
  return Promise.all([...byWorkflow.values()].map(dispatchSource));
}

// State of the workflow run a Refresh click started, for the admin Data page.
// "pending" until GitHub lists a run created at/after the click (it can take a
// few seconds to appear); then queued → running → success/failure. Any trigger
// counts (a scheduled run that starts after the click refreshes the data too).
// Several sources share a workflow (Communications, Work orders and Payments
// all run leadsimple-search sync.yml), so it follows the FIRST run after the
// click — a later click's run must not hold this button's status hostage.
export type RunState =
  | { state: "pending" | "queued" | "running" }
  | { state: "success" | "failure"; url: string; startedAt: string | null }
  | { state: "error"; error: string };

// A run already queued or running, so the page can pick it up after a reload.
// `since` is its creation time, to follow it with latestRunState.
export type ActiveRun = { state: "queued" | "running"; since: string } | { state: "idle" } | { state: "error"; error: string };

type GhRun = {
  status: string; // queued | in_progress | completed | pending | waiting | requested
  conclusion: string | null;
  created_at: string;
  run_started_at?: string | null;
  html_url: string;
};

// Clock-skew allowance between our server and GitHub when matching the run.
// `since` is the server's dispatch time (see /api/admin/refresh), so this only
// covers server↔GitHub drift; kept small so a run started by an earlier click
// isn't mistaken for this one.
const SKEW_MS = 10_000;

async function recentRuns(source: DataSource): Promise<GhRun[] | { error: string }> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return { error: "GITHUB_DISPATCH_TOKEN not set." };
  const { owner, repo, workflow, ref } = source.dispatch;
  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/runs`);
  url.searchParams.set("branch", ref);
  url.searchParams.set("per_page", "10");
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });
    if (!res.ok) return { error: `GitHub HTTP ${res.status}` };
    const body = (await res.json()) as { workflow_runs?: GhRun[] };
    return (body.workflow_runs ?? []).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Status request failed." };
  }
}

const isActive = (r: GhRun) => r.status !== "completed";
const activeState = (r: GhRun): "queued" | "running" => (r.status === "in_progress" ? "running" : "queued");

export async function latestRunState(source: DataSource, since: Date): Promise<RunState> {
  const runs = await recentRuns(source);
  if (!Array.isArray(runs)) return { state: "error", error: runs.error };
  const after = since.getTime() - SKEW_MS;
  // runs are newest-first; the last match is the earliest run after the click.
  const run = runs.filter((r) => Date.parse(r.created_at) >= after).at(-1);
  if (!run) return { state: "pending" };
  if (isActive(run)) return { state: activeState(run) };
  return {
    state: run.conclusion === "success" ? "success" : "failure",
    url: run.html_url,
    startedAt: run.run_started_at ?? null,
  };
}

export async function activeRun(source: DataSource): Promise<ActiveRun> {
  const runs = await recentRuns(source);
  if (!Array.isArray(runs)) return { state: "error", error: runs.error };
  // Oldest active run: it finishes first, so the status updates as each run
  // lands rather than only after the last one queued.
  const run = runs.filter(isActive).at(-1);
  return run ? { state: activeState(run), since: run.created_at } : { state: "idle" };
}
