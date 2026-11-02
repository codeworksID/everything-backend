---
name: backend-deploy
description: Plans and generates deployment for backend services. Picks a target (PaaS, containers on a VM, Kubernetes, serverless), writes Dockerfiles for Node, Python, Go and Java, docker compose for local runs, CI/CD pipelines with a gated migration step, Kubernetes manifests or Helm values, and a release plan with rolling, blue-green or canary strategy, rollback and post-deploy checks. Validates the artifacts locally and records the setup in deployment memory and a deploy runbook. Use when the user says deploy, ship to production, Dockerfile, containerize, docker compose, CI/CD, GitHub Actions, GitLab CI, pipeline, Kubernetes, K8s, Helm, readiness or liveness probes, release strategy, canary, blue-green, rollback a release, or environment promotion. Not for writing migrations (backend-migrate), backup, DR and resilience (backend-ops), code health checks (backend-doctor) or security review (backend-security).
---

# Backend Deploy

Turns a working backend into something that builds, ships and rolls back safely. This skill generates and validates deployment files and the release plan. It never deploys, pushes images or applies infrastructure on its own: those steps are Always Ask First, and they normally run in the user's CI.

## When to Use

- Containerize a service, or fix a Dockerfile or compose file.
- Create or update a CI/CD pipeline, including the migration step and the deploy job.
- Choose where to run the service, or move from one platform to another.
- Add Kubernetes manifests or Helm values, probes, autoscaling or disruption budgets.
- Plan a release: strategy, migration order, rollback, post-deploy verification.
- Run a release the user explicitly asks for (see Running a Release).

Not for: authoring or applying migrations outside a pipeline (backend-migrate); health endpoint code, resilience, backups and DR, SLO alerts (backend-ops); code-level health checks (backend-doctor); threat modeling, image or secret scanning review (backend-security).

## Before You Start

1. Resolve the shared docs folder ("<shared>"): first `_shared/` inside this skill's folder (bundled installs), then `../_shared/` next to it; other fallbacks are in `<shared>/context-loading.md` -> Resolving `_shared/` Files. A missing shared doc is a warning, not a stop.
2. Read `<shared>/tool-rules.md` (mode=auto contract, Production Targets, Command Time Budgets, checkpoints) and `<shared>/host-tools.md` if the action names below don't match your host's tools. Read the System and Security sections of `<shared>/principles.md`.
3. Load project memory per `<shared>/context-loading.md`: `project-overview.md`, `tech-stack.md`, `deployment.md` (priority 7) and `db-schema.md` for backing services; `decisions.md` for prior hosting choices. A missing `deployment.md` is expected on the first run; this skill creates it.
4. If the detected stack matches a file in `<shared>/stacks/`, read it. Its Dockerfile, health and shutdown sections take precedence over the generic templates here.

## Execution Boundary

Follows `<shared>/tool-rules.md` -> `mode=auto` Contract; the contract wins on any conflict.

- **Runs without asking:** reading the project; creating new deployment files that do not exist yet (Dockerfile, `.dockerignore`, compose files, K8s manifests, Helm values, runbook); memory updates; local validation (`docker build`, `docker compose config`, linters, `helm template`, `kubeconform`); `docker compose up --wait` only when every service it starts is a local container.
- **Always Ask First (also in mode=auto):** creating or editing CI/CD config (`.github/workflows/*`, `.gitlab-ci.yml`, other pipeline files); creating or editing `.env*` or secret files; overwriting or editing any existing deployment file (show a diff instead of replacing it); `docker push`; any deploy (`kubectl apply/rollout/scale/delete`, `helm install/upgrade/rollback/uninstall`, `terraform`/`tofu`/`pulumi` apply or destroy, `fly deploy`, `vercel --prod`, `gcloud ... deploy`, `aws ... deploy`, `serverless deploy`); applying migrations (only through backend-migrate or the pipeline step the user approved); `kubectl ... --dry-run=server`, which talks to a cluster.
- When asking, show the exact command, the resolved target (cluster context, registry, environment, account), whether it is production per Production Targets, and the expected effect.

## Workflow

### 1. Detect stack, target and existing artifacts

- Follow `<shared>/context-loading.md` -> Standard Prerequisites for the manifest and stack. Any manifest it lists is valid. If no Dockerfile template here fits the stack (Rust, Ruby, PHP, .NET, Elixir), use the general rules in [references/dockerfiles.md](references/dockerfiles.md) and the ecosystem's official image; do not stop.
- From the manifest and code, derive: build command, start command, listening port, runtime version (`.nvmrc`, `engines`, `.python-version`, `go.mod`, `pom.xml`/`build.gradle` toolchain), health routes, migration tool and command, and backing services (database, cache, queue).
- Find existing artifacts: `Dockerfile*`, `.dockerignore`, `docker-compose*.yml`, `compose*.yaml`, `.github/workflows/*`, `.gitlab-ci.yml`, `k8s/`, `deploy/`, `charts/`, `helm/`, `kustomization.yaml`, `*.tf`, `Pulumi.yaml`, `fly.toml`, `render.yaml`, `app.yaml`, `vercel.json`, `serverless.yml`, `template.yaml` (SAM), `Procfile`. Read every one you find.
- Read `deployment.md` -> `## Migration Phases` (written by backend-migrate). Note any open entry and its next phase.

Output: a short inventory (stack facts, existing artifacts, open migration phases, gaps). In a monorepo, ask which service to target unless the request makes it clear.

### 2. Choose the strategy

| Situation | Target |
|---|---|
| Small team, no ops capacity, one or two services, standard web workload | PaaS (Fly.io, Render, Railway, Heroku, Cloud Run, App Runner, Azure Container Apps) |
| Predictable traffic, a few services, one or two hosts, team can run Docker | Containers on a VM (compose or systemd plus a reverse proxy) |
| Three or more independently deployed services, autoscaling, team or managed offering can run a cluster | Kubernetes (managed: EKS, GKE, AKS) with plain manifests, Kustomize or Helm |
| Spiky or event-driven work, short requests, can accept cold starts and per-request DB limits | Serverless functions (Lambda, Cloud Functions, Azure Functions) |

If `deployment.md`, `decisions.md` or existing artifacts already name a target, keep it unless the user asks to change. If the choice is unclear, present the two best options with trade-offs and ask. Platform notes, serverless caveats and IaC boundaries are in [references/platforms.md](references/platforms.md).

Output: the chosen target and release strategy (default: rolling with readiness gates; see step 5).

### 3. Plan files and start a checkpoint

List every file you will create or change, with its path (see Outputs). For an existing file, plan a diff, not a rewrite.

Start a checkpoint before the first edit:

```bash
node <shared>/scripts/checkpoint.js start --skill backend-deploy --feature <slug>
```

Use a slug such as `deploy-setup` or `k8s-migration`. Record each file you create or edit (`checkpoint.js record --skill backend-deploy --feature <slug> --created a,b --modified c,d`, plus `--memory <file>` for memory updates and `--done <step>` per finished step), run `checkpoint.js snapshot` after each step, and `checkpoint.js close` when done. If `start` exits with code 3, an open checkpoint exists: offer to resume it or restart with `--restart`. If Node is unavailable, follow `<shared>/tool-rules.md` -> Concurrent & Partial Work by hand.

### 4. Generate artifacts

Generate only what the target needs, using the project's real commands, port, versions and health routes. Never invent script names: take them from the manifest.

- **Dockerfile and `.dockerignore`**: multi-stage, non-root numeric UID, exec-form start command, runtime version from the project, no secrets in layers. [references/dockerfiles.md](references/dockerfiles.md).
- **Local compose**: app plus backing services with healthchecks, per-service env, service DNS names, and `.env.example` with empty secret values. [references/local-compose.md](references/local-compose.md).
- **CI/CD pipeline**: validate on pull requests; on the main branch build once, tag with the commit SHA, push, run the gated migration job, deploy, verify. [references/ci-pipelines.md](references/ci-pipelines.md).
- **Kubernetes or Helm** (only when targeted): Deployment with probes, resources and securityContext, Service, PDB, HPA, ConfigMap and Secret references, migration Job. [references/kubernetes.md](references/kubernetes.md).
- **Health and shutdown**: confirm the app exposes liveness and readiness routes and drains on SIGTERM. Use existing routes if present; otherwise default to `/healthz` and `/readyz` (as in `<shared>/stacks/`). If code changes are needed, hand them to backend-ops or apply the stack file's snippet. [references/health-shutdown.md](references/health-shutdown.md).

**Migration step (required when the service has a database):**

- Migrations run once per release as a separate job: a CI job, a Kubernetes Job, or a Helm `pre-upgrade` hook. Never in the container start command and never on every replica at startup.
- Order: expand migrations (`pre-deploy`) -> app rollout -> verify. Contract migrations (`post-deploy`) never run in the same pipeline run as the deploy; they run in a later release, from a manually triggered job, after backend-migrate's Contract Gate passes.
- The job is gated: production runs require an approval (protected environment, manual job) and a single concurrency group so two runs never migrate at once.
- backend-deploy wires the step and the command; backend-migrate writes and labels the migrations. If a migration has no kind and timing label, hand it back to backend-migrate.

### 5. Validate locally

Run what is available; report each check as passed, failed, or "not run" with the reason (tool missing, needs a cluster). Never report an unrun check as passed.

| Artifact | Checks |
|---|---|
| Dockerfile | `docker build -t <app>:local .`; `hadolint Dockerfile` if installed |
| Compose | `docker compose config -q`; `docker compose up -d --wait` then hit the readiness route, then `docker compose down` (never `down -v` without asking) |
| GitHub Actions | `actionlint` if installed; otherwise check YAML syntax and that every referenced script exists |
| GitLab CI | YAML syntax and referenced scripts; `glab ci lint` talks to the GitLab API, so ask first |
| Kubernetes | `kubeconform -strict -summary <dir>` if installed; `kustomize build` if used |
| Helm | `helm lint <chart>`; `helm template <release> <chart> -f <values>` piped to `kubeconform` |

Fix failures in files this run created. For a failure in a pre-existing file, report it and propose a diff.

### 6. Write the release plan and runbook

Using [references/release-rollback.md](references/release-rollback.md), decide and write down:

- **Strategy**: rolling (default), blue-green, or canary, with the reason.
- **Migration order** for this release, from `## Migration Phases`.
- **Rollback**: app rollback by redeploying the previous image SHA. Expand migrations stay. Never roll the app back past an expand, or run a down migration, without checking that the older code works with the current schema.
- **Post-deploy verification**: readiness of all new instances, smoke tests against the deployed URL, then a watch window on error rate, latency and saturation against the pre-deploy baseline, with rollback triggers.

Write `docs/runbooks/deploy.md` from the template in that reference.

### 7. Record memory and decisions

- Write or update `.opencode/everything-backend-memory/deployment.md` with the sections below. Update only the sections you own; keep `## Migration Phases` (backend-migrate) and `## Backup and DR` / `## Runbooks` (backend-ops) as they are.
- Append a `decisions.md` entry when you chose or changed the platform or release strategy (format in `<shared>/memory-schema.md`).
- Record the memory files in the checkpoint, snapshot, and close it with `--status completed`.

`deployment.md` sections owned by this skill:

```markdown
# Deployment
## Targets          (environment -> platform, region or cluster, URL, approval required)
## Artifacts        (path of each generated file)
## Pipeline         (CI system, file, jobs and order, triggers, image registry and tag scheme)
## Migration Step   (tool, command, where it runs, lock or concurrency control, approval gate)
## Release Strategy (rolling, blue-green or canary, and why)
## Health Probes    (liveness and readiness routes, ports, timings, shutdown grace period)
## Rollback         (app rollback command, migration compatibility rule)
## Post-Deploy Verification (smoke tests, watch window, rollback triggers)
## Config and Secrets (env var names and where each secret lives, how it reaches the runtime; never values)
## Last Updated
```

### 8. Report

Summarize: target and strategy, files created and changed, validation results (passed, failed, not run), open migration phases, and the commands left for the user (push, first deploy, secret setup), each marked as needing approval.

**Done when:** every generated file is at its stated path; every validation check is reported as passed, failed or not run with a reason; the pipeline has an explicit gated migration step (if there is a database) and a deploy and verify stage; `docs/runbooks/deploy.md` and `deployment.md` are written; any platform decision is in `decisions.md`; no push, deploy or apply ran without approval; and the checkpoint is closed.

## Running a Release

Only when the user asks to deploy now. Each step that changes a remote system is Always Ask First.

1. Read `deployment.md` and the runbook. Confirm the target environment, image SHA and the previous SHA for rollback.
2. Check `## Migration Phases`: if this release includes expand migrations, run them through the approved pipeline job or hand off to backend-migrate to apply them. Stop if any contract migration is pending for this run.
3. Trigger the deploy through the pipeline when one exists (preferred) or with the recorded command after approval.
4. Run post-deploy verification. If a rollback trigger fires, propose the app rollback from the runbook and ask.
5. Update `deployment.md` (last deployed SHA and date) and report.

## Outputs

| Output | Path |
|---|---|
| Container image definition | `Dockerfile` (or `<service>/Dockerfile` in a monorepo), `.dockerignore` |
| Local stack | `compose.yaml` (or the existing `docker-compose.yml`), `compose.override.yaml` for local-only overrides, `.env.example` |
| CI/CD | `.github/workflows/ci.yml` and `.github/workflows/deploy.yml`, or `.gitlab-ci.yml` |
| Kubernetes | `deploy/k8s/` (base manifests) or `deploy/helm/<app>/values-<env>.yaml` for an existing chart |
| Runbook | `docs/runbooks/deploy.md` |
| Deployment memory | `.opencode/everything-backend-memory/deployment.md` |
| Decision record | `.opencode/everything-backend-memory/decisions.md` |

Keep existing paths and file names when the project already has them.

## Rollback of This Run

`checkpoint.js rollback --skill backend-deploy --feature <slug>` reverts files this run edited; created files are deleted only with `--delete-created` after the user confirms (`<shared>/tool-rules.md` -> Rollback). It does not undo a push, deploy or migration that already ran; use the release rollback in the runbook for those.

## Handoffs

- **backend-migrate**: writes, labels and applies migrations; owns `## Migration Phases`.
- **backend-ops**: health endpoint code, graceful shutdown, resilience, observability, SLO alerts, backups and DR.
- **backend-security**: image and dependency scanning policy, secret management review, supply chain.
- **backend-doctor**: verifies the running service after changes.

## References

- [references/dockerfiles.md](references/dockerfiles.md): read when writing or fixing a Dockerfile or `.dockerignore`; Node, Python, Go and Java templates and general rules for other stacks.
- [references/local-compose.md](references/local-compose.md): read when writing compose files or `.env.example`, or running the stack locally.
- [references/ci-pipelines.md](references/ci-pipelines.md): read when writing GitHub Actions or GitLab CI, the migration job, deploy jobs, environment promotion or supply-chain steps.
- [references/kubernetes.md](references/kubernetes.md): read when the target is Kubernetes, Kustomize or Helm.
- [references/release-rollback.md](references/release-rollback.md): read when choosing a release strategy, planning rollback or post-deploy checks, or writing `docs/runbooks/deploy.md`.
- [references/platforms.md](references/platforms.md): read when choosing a target, deploying to a PaaS, VM or serverless, or when the user asks about infrastructure as code.
- [references/health-shutdown.md](references/health-shutdown.md): read when the service lacks health routes or graceful shutdown, or probes fail.
