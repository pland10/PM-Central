---
name: verify-sync
description: Use when a sync, secret, or data fix must be proven — "run the sync", "did it work", "verify the key", after rotating a secret, or after changing anything in src/import, scripts/sync-*, or the leadsimple-search Python syncs. Dispatches a GitHub Actions workflow, waits for it, and reads the log lines that prove the result.
---

# Verify via GitHub Actions

This sandbox cannot reach pmilighthouse.app or *.vercel.app (proxy 403), so
**Actions runs are how Claude proves things**. Never claim a sync or secret works
from a green checkmark alone — read the log line.

## 1. Pick the workflow

| Repo | Workflow | Proves |
|---|---|---|
| PM-Central | `sync-rentvine.yml` | Rentvine core + WO sync, `DATABASE_URL`, Rentvine Actions creds, renewal correction |
| PM-Central | `sync-balances.yml` | Rentvine balance report, `DATABASE_URL` |
| leadsimple-search | `sync.yml` | LeadSimple key, Neon, Rentvine (Lead Simple key), RingCentral, settlements |
| leadsimple-search | `health-check.yml` (input `dry_run: "false"`) | Resend email actually sends |
| leadsimple-search | `open-loops-digest.yml` | Resend + digest |
| leadsimple-search | `rc-chat-sync.yml` | RingCentral + Supabase Storage key |

To test **unmerged** code, dispatch against the feature branch (`ref`) — it runs
that branch's code against the prod DB. Say so to the user first; it writes real data.

## 2. Dispatch and wait
`mcp__github__actions_run_trigger` with `method: run_workflow`, `workflow_id`,
`ref`. Then find the run and poll in the background (never foreground `sleep`):

```bash
rid=$(gh api 'repos/<owner>/<repo>/actions/workflows/<file>/runs?per_page=1&branch=<ref>' --jq '.workflow_runs[0].id')
for i in $(seq 1 40); do
  s=$(gh api repos/<owner>/<repo>/actions/runs/$rid --jq '.status+" "+(.conclusion//"-")')
  echo "[$i] $s"; case "$s" in completed*) break;; esac; sleep 15
done
```
Run it with `run_in_background: true`; you are re-invoked when it exits.

## 3. Read the logs — use the MCP tool
`gh api .../jobs/<id>/logs` **fails**: the built-in `gh` refuses the redirect to
blob storage. Instead:
1. Job id: `gh api repos/<owner>/<repo>/actions/runs/$rid/jobs --jq '.jobs[]|"\(.id) \(.conclusion)"'`
2. `mcp__github__get_job_logs` with `job_id`, `return_content: true`,
   `tail_lines` ~40. The tail is mostly post-job cleanup — raise `tail_lines`
   until the script's own output shows.

## 4. Lines that prove success
- `Synced "pmilighthouse" from rentvine: { properties: N, … leases: N }`
- `Fetched N work orders.` / `Synced N Rentvine work orders`
- `[renewal] lease <id>: end <old> -> <new>` (renewal correction applied)
- `Sync complete!` + `/processes page …` (LeadSimple key works)
- `Sent to <addr>: …` (Resend works; a missing line means the sender skipped —
  usually an unset key — even though the job is green)

Failure tells: `HTTP 401` (stale key/secret), `skip … — missing …` (secret not
wired into that workflow's `env:`), Prisma `P1000`/`28P01` (DB password).

## 5. Report
Quote the proving line(s). If a step was skipped or its output didn't appear,
say so plainly — never round "job succeeded" up to "verified".
