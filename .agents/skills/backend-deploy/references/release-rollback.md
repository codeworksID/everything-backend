# Release Strategy, Rollback and Verification

## Choose a Strategy

| Strategy | How it works | Use when | Needs |
|---|---|---|---|
| Rolling (default) | Replace instances a few at a time; readiness gates each step | Most services; changes are backward compatible | Readiness probe, `maxUnavailable: 0`, enough capacity for surge |
| Blue-green | Run the new version beside the old one, switch traffic at once, keep the old one warm | Fast, whole rollback is required; startup is slow; PaaS supports it (slots, revisions) | Double capacity during the switch; both versions must work with the same schema |
| Canary | Send a small share of traffic (for example 5%, then 25%, then 100%) to the new version and compare metrics | High-traffic or high-risk changes; you have per-version metrics | Traffic splitting (service mesh, ingress weights, Argo Rollouts, Flagger, Cloud Run or App Runner traffic split) and per-version dashboards |
| Recreate | Stop all old instances, then start new ones | Only when two versions cannot run at once and downtime is accepted | A maintenance window |

In every strategy, old and new code run against the same database at the same time. That is why schema changes follow expand/contract (backend-migrate): the expand step must work with both versions.

Feature flags separate deploy from release: ship code dark, then turn it on gradually. Prefer them for risky behavior changes.

## Release Order with Migrations

1. Read `deployment.md` -> `## Migration Phases`. List the migrations in this release and their kind and timing.
2. Build and push the image (tag = commit SHA).
3. Run `pre-deploy` (expand) migrations once, as the gated migration job.
4. Roll out the app with the chosen strategy.
5. Verify (see Post-Deploy Verification).
6. `job` backfills run after dual-write code is live on every instance (backend-migrate runs or schedules them).
7. `post-deploy` (contract) migrations wait for a later release, after every instance runs the new code, the old version is gone from every pool (canary, blue slot, rollback target), and the Contract Gate passes.

## Rollback

### App rollback

Redeploy the previous image SHA recorded in `deployment.md`. Examples (each Always Ask First):

| Target | Command |
|---|---|
| Kubernetes | `kubectl rollout undo deployment/<app>` or `kubectl set image deployment/<app> app=<image>:<previous-sha>` |
| Helm | `helm rollback <release> <revision>` (rolls back manifests only, never the database) |
| Fly.io | `fly deploy --image <image>:<previous-sha>` |
| Cloud Run | `gcloud run services update-traffic <service> --to-revisions <previous-revision>=100` |
| Blue-green | switch traffic back to the old color |
| Canary | set the canary weight to 0 |

### Migration compatibility (check before any app rollback)

- **After an expand migration**: rolling the app back is usually safe, because a correct expand is additive and the previous version ignores it. Leave the expand migration in place, and still run the check below.
- **Never roll the app back past an expand without checking** that the older code still works with the current schema: no new NOT NULL column without a default that old inserts would violate, no constraint old writes break, no renamed structure the old code reads.
- **After a contract migration**: the previous app version may read dropped structures. Do not roll back the app past the release that stopped using them; fix forward instead.
- **Down migrations** are a last resort, run only through backend-migrate with approval. A down migration of a contract cannot bring dropped data back; that needs a restore (backend-ops).
- If data was written in a new format, check that the old code can read it before rolling back.

### Rollback triggers

Roll back (after asking) when, during the watch window:

- the new instances fail readiness or crash-loop;
- smoke tests fail;
- the 5xx rate or p95/p99 latency exceeds the pre-deploy baseline by the thresholds in the runbook (for example error rate above 2x baseline and above 1%, or p95 above 1.5x baseline for 5 minutes);
- a key business metric drops (sign-ups, checkouts, messages processed).

## Post-Deploy Verification

1. **Rollout health**: every new instance is ready; no restarts (`kubectl rollout status`, the platform's deployment status).
2. **Smoke tests**: hit the readiness route on the public URL, then one or two read-only requests that touch the database. No writes against production unless the user approves a safe test path.
3. **Watch window**: 10 to 30 minutes (longer for canaries at each step). Compare error rate, latency (p50, p95, p99), saturation (CPU, memory, DB connections, queue depth) and logs for new error types against the 30 minutes before the deploy.
4. **Record**: last deployed SHA, date, result, and anything unusual in `deployment.md`.

The agent can run read-only checks against production only with approval, since the target is not provably local.

Example `scripts/smoke.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:?usage: smoke.sh BASE_URL}"
for i in $(seq 1 30); do
  if curl -fsS --max-time 5 "$BASE_URL/readyz" >/dev/null; then break; fi
  [ "$i" -eq 30 ] && { echo "readiness never passed"; exit 1; }
  sleep 5
done
curl -fsS --max-time 10 "$BASE_URL/<a read-only endpoint>" >/dev/null
echo "smoke ok"
```

Mark it executable in git (`git update-index --chmod=+x scripts/smoke.sh`) so it runs on Linux runners, even when created on Windows.

## Runbook Template: docs/runbooks/deploy.md

```markdown
# Deploy Runbook: <service>

Last updated: <YYYY-MM-DD>

## Overview
- Target: <platform, region/cluster, namespace>
- Environments: staging (<url>), production (<url>)
- Pipeline: <file path>; production approval by <role or environment protection>
- Strategy: <rolling | blue-green | canary> because <reason>

## Before Deploying
- [ ] CI green on the commit to ship
- [ ] Migration Phases checked: expand migrations listed, no contract in this release
- [ ] Previous production SHA noted: <sha>
- [ ] Backup or PITR covers now (required before any one-way step; see backend-ops)

## Deploy
1. Trigger: <how>
2. Migration job: <command / job name>; wait for success
3. Rollout: <command>; wait for <status command>

## Verify
- Smoke: `scripts/smoke.sh <url>`
- Watch for <N> minutes: <dashboard links>; thresholds: <error rate, latency>

## Roll Back
- App: <command with previous SHA>
- Schema: expand stays; contract cannot be rolled back, fix forward; down migrations only via backend-migrate
- Who to tell: <channel>

## Troubleshooting
- Migration job failed: <logs command>; stop, do not rerun; hand to backend-migrate
- Pods not ready: <describe/logs commands>; check probes, config, secrets
```
