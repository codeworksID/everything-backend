---
name: backend-ops
description: "Makes a backend operable in production: audits and adds observability (structured logs, correlation IDs, metrics, OpenTelemetry tracing, health endpoints, SLOs, burn-rate alerts, runbooks), resilience patterns (timeouts, safe retries with jitter, circuit breakers, bulkheads, load shedding, idempotency keys, outbox), caching, queues and async messaging, config and secrets handling, and backup, restore drills and disaster recovery. Writes runbooks to docs/runbooks/. Use when the user says 'add logging', 'observability', 'metrics', 'tracing', 'SLO', 'alerting', 'runbook', 'incident runbook', 'timeouts', 'retries', 'circuit breaker', 'caching strategy', 'queue', 'outbox', 'config management', 'feature flags', 'secrets injection', 'backups', 'point-in-time recovery', 'disaster recovery', 'RPO', 'RTO', or 'make this operable in production'. Not for CI/CD and deploy pipelines (backend-deploy), security review (backend-security) or fixing a specific bug (backend-debug)."
---

# Backend Ops

Make the service observable, resilient and recoverable. This skill audits what exists, recommends patterns that fit the stack, implements the agreed changes, verifies them, and records the decisions.

## When to Use

- Observability: logging, metrics, tracing, health and readiness endpoints, SLOs, alerting, incident runbooks.
- Resilience: timeouts, retries, circuit breakers, bulkheads, load shedding, fallbacks, idempotency keys, outbox.
- Caching, queues, background jobs and message brokers.
- Config validation, feature flags, secrets injection and rotation.
- Backups, point-in-time recovery, restore drills and disaster recovery.
- "Make this production-ready" (the ops part; pipelines and release go to `backend-deploy`).

Not for:
- Dockerfiles, CI/CD, Kubernetes manifests, release strategy and rollback of deploys: `backend-deploy`.
- Threat modeling, OWASP review, secret scanning and supply chain: `backend-security`.
- Fixing a specific bug or outage root cause: `backend-debug`.
- Writing or applying migrations: `backend-migrate`.
- Building new feature code: `backend-implement` (this skill adds cross-cutting ops code such as middleware, clients and config modules).

## Before You Start

1. Resolve the shared docs folder ("<shared>"): first `_shared/` inside this skill's folder (bundled installs), then `../_shared/` next to it; other fallbacks are in `<shared>/context-loading.md` -> Resolving `_shared/` Files. A missing shared doc is a warning, not a stop.
2. Read `<shared>/tool-rules.md` (mode=auto contract, Production Targets, checkpoints) and `<shared>/host-tools.md` if the action names below don't match your host's tools. Read `<shared>/principles.md` -> System and Security, and `<shared>/secure-coding.md` -> S6, S12, S13, S15, S16 and S17 (outbound calls, TLS, secrets, limits and timeouts, webhooks, logging without secrets). Read `<shared>/memory-schema.md` -> decisions.md, issues.md and tech-stack.md before writing memory.
3. Load project memory per `<shared>/context-loading.md`: `decisions.md` (prior ops choices), `tech-stack.md` (language, framework, infra), `api-patterns.md` (hot paths to instrument and cache), `project-overview.md` (services and source roots), and `deployment.md` if present (health paths, platform). Load `issues.md` for audits. If memory is empty or stale, suggest `backend-scan`; if the user declines, continue from what the codebase shows. For a greenfield design request, work from the user's requirements.
4. If the detected stack matches a file in `<shared>/stacks/`, read it.

## Workflow

### Step 1: Scope the request

Map the request to one or more areas: observability, resilience, caching, messaging, config/secrets, backup/DR. "Production-ready" means all six.

For each area, learn the constraints that change the answer. Ask once, in one message, only for what memory and code do not show:
- traffic and latency targets, or existing SLOs;
- which dependencies are critical (DB, cache, broker, third-party APIs);
- RPO and RTO for each datastore (backup/DR);
- where the service runs and which observability backend exists.

Output: the list of areas, the services in scope, and a feature slug for the checkpoint (for example `ops-observability`). Done when the scope is confirmed or, in `mode=auto`, stated.

### Step 2: Audit the current state

Run the probes for each in-scope area from `references/audit-probes.md`. Search the source roots from `project-overview.md` and use per-language patterns for the detected stack only.

- Confirm every match by reading the code. A match is a lead, not a finding.
- Record each finding with path and line, probe, short excerpt (secrets masked), severity, violated principle and fix. Use the severity rubric in `references/audit-probes.md`.
- A probe that cannot run is reported as "did not run", never as clean.
- Detect existing health routes and deploy probe paths before calling one missing (`references/observability.md` -> Health Endpoints).

Output: a findings table. Done when every in-scope area has findings or an explicit "no gaps found" with the probes that ran.

### Step 3: Choose patterns

Pick the smallest set of patterns that closes the gaps. Use the decision tables below and the references. Prefer libraries already in the lockfile.

For each choice, note the alternative rejected and why; these become `decisions.md` entries in Step 6.

Output: a change plan listing files to create or edit, packages to add, and config or runbooks to write. If the user asked for a design only, skip to Step 6 and write the plan as the deliverable.

### Step 4: Confirm and implement

Follow the mode=auto contract in `<shared>/tool-rules.md`; do not redefine it here. In practice for this skill:

- Creating new files (middleware, config module, runbooks) and editing source files in place within the plan run without asking in `mode=auto`. In `mode=interactive`, show the plan and diffs first.
- Always Ask First: installing packages, editing CI/CD config or `.env*` files, secret rotation, IaC apply, changing backup settings on a real account, restores, and anything that touches a non-local target.
- If the service is in an active incident or the change sits on a hot path the user called fragile, pause and confirm the plan even in `mode=auto`.

Start a checkpoint before the first edit: `node <shared>/scripts/checkpoint.js start --skill backend-ops --feature <slug>`. Record each file you create or edit (`checkpoint.js record`), snapshot after each step, and close it when done. If Node is unavailable, follow `<shared>/tool-rules.md` -> Concurrent & Partial Work by hand. If `start` exits 3, offer resume or restart.

Implement in this order when several areas are in scope: config validation, logging and correlation IDs, health endpoints, timeouts and resilience, metrics and tracing, caching and messaging changes, runbooks. Per-stack code is in `references/scaffolding.md`.

Output: the edited and created files, recorded in the checkpoint.

### Step 5: Verify

Run the checks in `references/scaffolding.md` -> Verify After Generating, plus the area-specific checks in each reference (resilience fault tests, cache and queue checks, restore drill for backup/DR).

- Type-check, lint and unit tests run without asking, after you read the script body; a script that runs migrations or connects to a database or other target is an integration run.
- Starting the app or integration tests run only if every target is provably local (`<shared>/tool-rules.md` -> Production Targets). Otherwise give the user the exact commands.
- Follow Command Time Budgets. A check that did not complete is reported as such.
- Never report a gap as fixed unless a check proved it.

Done when every change has a passing check or is listed as "not verified" with the reason.

### Step 6: Record and report

1. Append to `decisions.md` one entry per choice (log format, health paths, metrics port, sampling ratio, cache strategy, queue technology, retry policy, RPO/RTO, backup mechanism), using the schema in `memory-schema.md`.
2. Update `tech-stack.md` optional sections `## Observability`, `## Caching` and `## Messaging` with tools now in use. If `deployment.md` exists, append its optional `## Runbooks` and `## Backup and DR` sections (links, backup schedule, last tested restore, RPO/RTO); do not create it, `backend-deploy` owns it.
3. Log unresolved findings in `issues.md` (secrets masked), with the owner skill in `### Recommendation`.
4. Write runbooks to `docs/runbooks/<topic>.md` (alert runbooks, `incident-response.md`, `disaster-recovery.md`). Edit existing runbooks in place; keep their drill logs and history.
5. Close the checkpoint (`checkpoint.js close --skill backend-ops --feature <slug> --status completed`).
6. Give the Ops Report from `references/audit-probes.md` -> Ops Report Template.

Done when memory is updated, the checkpoint is closed and the report lists findings, changes, verification results and open items.

## Exit Checklist ("production-ready" from the ops side)

- [ ] Structured JSON logs with correlation IDs; secrets and PII redacted in the logger.
- [ ] Liveness and readiness endpoints that match the deploy config; readiness fails during shutdown.
- [ ] RED metrics with route-template labels on an internal port; traces exported via OTLP with sampling.
- [ ] SLOs defined, burn-rate alerts set, each alert linked to a runbook.
- [ ] Every remote call has a timeout; retries only on idempotent operations, with jitter and a budget.
- [ ] Circuit breakers or bulkheads on critical dependencies; overload returns 429/503 with `Retry-After`.
- [ ] Consumers are idempotent, ack after success, and have a monitored DLQ.
- [ ] Config validated at startup; secrets come from a manager, not files in the repo.
- [ ] Backups encrypted and off-site, RPO/RTO recorded, a restore drill passed, `docs/runbooks/disaster-recovery.md` exists.

Unchecked items go into the report and `issues.md`.

## Resilience Decision Table

| Situation | Pattern | Notes |
|---|---|---|
| Any remote call (HTTP, gRPC, DB, cache, broker, SDK) | Timeout plus deadline propagation | callee timeout shorter than caller's; fail fast when the budget is spent |
| Transient failure on an idempotent or safe operation | Retry with exponential backoff and full jitter | 2 to 3 attempts, honor `Retry-After`, retry budget, one retry layer only |
| Non-idempotent write that clients or workers retry | Idempotency key | unique per caller and key; store response; 409 while in progress |
| Dependency failing or slow repeatedly | Circuit breaker plus fallback | one breaker per dependency; fail closed on auth, payments, inventory |
| One slow dependency starves the rest | Bulkhead (per-dependency pool or semaphore) | size DB pools from server `max_connections` |
| Traffic above capacity | Load shedding | concurrency limit, drop requests past their deadline, 503/429 with `Retry-After` |
| DB write and event publish must both happen | Transactional outbox | relay with `FOR UPDATE SKIP LOCKED` or CDC |
| Messages may arrive twice | Inbox / dedup table or idempotent upsert | at-least-once is the default |

Details, client defaults and libraries: `references/resilience.md`.

## Other Quick Choices

- **Cache**: read-heavy and staleness-tolerant -> cache-aside with TTL; on writes commit first, then delete the key. Per-user data -> keys scoped by tenant and user, `Cache-Control: private` or `no-store`. Hot expensive keys -> single-flight plus TTL jitter.
- **Messaging**: background jobs -> job queue; fan-out -> pub/sub; ordered replayable events -> stream with partition keys; publish-after-commit -> outbox.
- **Observability**: one service -> logs, metrics, health; several services -> add OTel tracing; paging -> SLO burn-rate alerts with runbooks.
- **Backup/DR**: tier 1 data -> PITR (WAL or binlog archiving, or managed PITR) plus off-site immutable copy plus quarterly restore drill.

## Safety Rules

- Restores, `pg_dump` against a remote database, and backup-setting changes on a real account are Always Ask First. Never restore over the source.
- Never print, log or store secret values; mask them in every excerpt.
- A leaked secret in code is fixed by rotate-first (`references/config-secrets.md` -> Leak response), and rotation asks first.
- Do not add dependencies or edit CI/CD without confirmation.

## Handoffs

- Deploy probes, pipeline steps, release strategy -> `backend-deploy` (share the health paths and metrics port from `decisions.md`).
- Security findings beyond secrets hygiene -> `backend-security`.
- Bugs found during the audit -> `backend-debug`. Feature code changes (for example idempotency keys inside a handler's business logic) -> `backend-implement`.
- Schema changes such as outbox or inbox tables -> `backend-migrate` writes the migration; this skill specifies the table.
- Execution-based health check of the whole project -> `backend-doctor`.

## References

- `references/audit-probes.md`: read in Step 2 for search patterns per area and language, the severity rubric, the finding format and the Ops Report template.
- `references/observability.md`: read when the scope includes logging, correlation IDs, metrics, tracing, health endpoints, SLOs, alerting or incident runbooks.
- `references/scaffolding.md`: read when generating observability code (Express, NestJS, FastAPI, Django, Go net/http and Gin, Spring Boot, OpenTelemetry bootstrap) and for the post-generation verification steps.
- `references/resilience.md`: read when the scope includes outbound calls, timeouts, retries, circuit breakers, bulkheads, load shedding, fallbacks or idempotency keys.
- `references/caching.md`: read when adding or reviewing a cache, cache keys, invalidation, stampede protection or HTTP cache headers.
- `references/messaging.md`: read when the scope includes queues, background jobs, brokers, streams, DLQs, the outbox or consumer deduplication.
- `references/config-secrets.md`: read when the scope includes config loading, environment variables, feature flags, secret managers, rotation or a leaked secret.
- `references/backup-dr.md`: read when the scope includes backups, PITR, RPO/RTO, restore drills or the disaster recovery runbook.
