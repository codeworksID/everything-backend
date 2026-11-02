# Orchestrator Workflows

Step details for the workflows in the orchestrator's Workflows table. The general rules in SKILL.md -> Gates and Loops (Always Ask First, severity gates, loop-backs, iteration cap of 3, test integrity) apply to every step and are not repeated here. Each step lists its output and the workflow-specific branches only. Each routed skill loads its own memory context; the orchestrator passes only `mode`, `feature=<slug>`, `review-only` when set, and a short summary of the previous step.

## Greenfield

Use when there is no project yet ("build me a backend from scratch").

1. `backend-architect`
   - Output: `docs/architecture/overview.md`, ADRs in `docs/adr/NNNN-<slug>.md`, summary entries in `decisions.md`, and the initial memory files it creates.
   - Branch: requirements unclear (users, scale, data, deadline) -> the architect asks; do not guess.
2. `backend-visualize` (optional, if the user wants diagrams of the plan)
   - Output: architecture diagram.
3. `backend-db-design`
   - Output: target schema in `db-schema.md`, handed to step 4.
4. `backend-migrate`
   - Output: initial migration files in the project's migration tool. Applying them follows Always Ask First, except a disposable local database this run started.
5. `backend-api-design`
   - Output: endpoint contracts, `api-patterns.md`.
6. `backend-auth` (if the service has users, tenants, or protected endpoints)
   - Output: auth design and code, decisions in `decisions.md`.
7. `backend-implement`
   - Output: source code for the designed endpoints.
8. `backend-test`
   - Output: tests and `test-strategy.md`.
   - Branch: implementation failures -> back to step 7 with the failing test.
9. `backend-security` (review-only)
   - Output: `docs/security/review-<YYYYMMDD>.md`, findings in `issues.md`.
10. `backend-ops`
    - Output: logging, metrics, health checks, config, resilience defaults.
11. `backend-deploy`
    - Output: container and CI/CD files, `deployment.md`.
12. `backend-doctor`
    - Output: health report, findings in `issues.md`.

Done when the service builds, tests pass, there is no open Critical finding, and the user has the architecture doc, ADRs, and deploy plan.

## Bug Fix

Use when something is broken, failing, erroring, regressed, or slow.

1. `backend-debug`
   - Output: reproduction, a failing test, the root cause, a minimal fix, and a passing regression test.
   - Branch: cannot reproduce -> report what was tried and ask for logs, inputs, or environment details; do not guess a fix.
   - Branch: root cause is the schema -> `backend-db-design` -> `backend-migrate`, then back to `backend-debug` to finish.
   - Branch: root cause is a security flaw -> also run `backend-security` on the affected area after the fix.
   - Branch: root cause is a design gap (missing behavior, not a defect) -> stop and offer the New Feature workflow.
   - Branch: performance -> after the cause is known, `backend-ops` for caching, pooling, or queue changes.
2. `backend-test`
   - Output: full suite run; extra tests around the fix if coverage of the area is thin.
   - Branch: other tests now fail -> back to step 1 with the failure.
3. `backend-doctor`
   - Output: health check of the changed area, findings in `issues.md`.

Done when the regression test fails without the fix and passes with it, the full suite passes, and the root cause is stated in the report.

## Schema Change

Use when a table, column, index, or constraint changes on an existing database.

1. `backend-db-design`
   - Output: target schema in `db-schema.md` and a change plan, handed to step 2.
2. `backend-migrate`
   - Output: migration files that follow expand/contract (expand now; contract later), lock-safe DDL, and backfills. The phase plan (expand now, contract later, with its trigger) is recorded in `deployment.md` -> `## Migration Phases`, with a summary in `decisions.md`.
   - Writing migration files runs without asking; applying them is Always Ask First in every mode.
   - Branch: the change cannot be made safely (locks, data loss, conflicting data) -> back to step 1 with the constraint.
3. `backend-implement`
   - Output: code that works with both the old and new schema during the expand phase (dual-write or read fallback where the plan needs it).
4. `backend-test`
   - Output: tests covering old and new paths, run against a disposable database.
5. `backend-deploy` (only if the user wants it shipped)
   - Output: a pipeline that runs migrations as an explicit, gated step in expand -> deploy -> contract order.

Done when migrations exist and are applied only where the user approved, code and tests pass against the expanded schema, and the contract step is recorded with its trigger.

## New Feature

Use for a significant feature on an existing backend.

1. `backend-scan` with `scope=sync` (or `scope=initial` if no memory exists), only if memory is missing or stale.
   - Branch: project path unreadable -> report the exact error and stop.
2. `backend-db-design` (if the feature touches data)
   - Output: target schema, handed to step 3.
   - Branch: the design conflicts with existing tables -> ask the user.
3. `backend-migrate` (only if the schema changes)
   - Output: migration files; expand/contract plan as in Schema Change.
4. `backend-api-design`
   - Output: endpoint contracts, `api-patterns.md`.
   - Branch: conflicts with existing API patterns -> ask the user.
5. `backend-auth` (if the feature needs authn, permissions, sessions, or tenant scoping)
   - Output: auth changes and decisions.
   - Branch: the auth design changes an API contract -> back to step 4 with the change.
6. `backend-implement`
   - Output: source code and its unit tests.
   - Branch: a missing schema field or relationship -> step 2, step 3, then step 4 if the contract changes, then resume this step.
7. `backend-test`
   - Output: tests for the feature.
   - Branch: implementation failures -> back to step 6 with the failing test.
   - Branch: coverage below the target in `test-strategy.md` -> add tests in this step. If no target is recorded, report coverage and do not loop.
8. `backend-doctor`
   - Output: health report, findings in `issues.md`.

Done when the feature behaves as designed, tests pass, and no Critical or unaccepted High finding is open.

## Quick Add Endpoint

Use when the stack, schema, and API patterns are known and the change is one small endpoint.

1. `backend-api-design`
   - Output: the endpoint contract.
   - Branch: it needs a schema change -> stop and offer the Schema Change or New Feature workflow; do not silently grow scope.
   - Branch: it conflicts with existing API patterns -> ask the user.
2. `backend-implement`
   - Output: source code.
   - Branch: the contract turns out incomplete -> back to step 1 with the gap.
3. `backend-test`
   - Output: tests for the endpoint.
   - Branch: implementation failures -> back to step 2 with the failing test.
4. Sensitive endpoints only (payments, auth, personal data, admin, file upload): `backend-auth` if access rules change, and `backend-security` review-only on the endpoint.

Done when tests pass, the endpoint matches its contract, and any sensitive endpoint has been reviewed.

## Refactor

Use to restructure code without changing behavior, optionally followed by documentation.

1. `backend-test`
   - Output: a passing baseline over the code to be refactored. If coverage of that area is thin, add characterization tests first.
   - Branch: baseline fails -> stop; that is a bug for the Bug Fix workflow, not a refactor.
2. `backend-refactor`
   - Output: restructured code; the baseline still passes unchanged.
   - Branch: the change would alter behavior -> stop and ask; behavior changes go to `backend-implement` or `backend-debug`.
3. `backend-doctor`
   - Output: health check of the changed area.
4. `backend-scan` with `scope=sync`, then `backend-visualize` (only if the user asked for diagrams or docs)
   - Output: updated memory and diagrams of the new structure.

Done when the baseline tests pass without edits to their assertions and the new structure is reported.

## Security Review

Use for security review, threat modeling, OWASP review, pentest prep, secret scanning, or SBOM.

1. `backend-security` (review-only)
   - Output: `docs/security/review-<YYYYMMDD>.md`, findings in `issues.md`.
2. Fixes, only if the user approves them: `backend-auth` for authn/authz findings, `backend-debug` for defects in existing code (fix plus regression test), `backend-implement` for new controls, `backend-deploy` for CI or image findings. Leaked secrets: tell the user to rotate them; the agent does not rotate secrets.
3. `backend-test`
   - Output: tests that cover each fixed finding.
4. `backend-security` re-check on the fixed findings.

Done when the review report exists and every Critical and High finding is fixed, accepted by the user, or listed as open in the final report. A review-only request ends after step 1.

## Production Readiness

Use before launch or when the user asks whether a service is production-ready. If the request is "check" or "assess", run every step review-only and report gaps instead of generating files; generate files only after the user asks.

1. `backend-security`
   - Output: security review report and findings.
2. `backend-ops`
   - Output: observability, alerting, runbooks in `docs/runbooks/`, resilience patterns (timeouts, retries, circuit breakers, rate limits), and backup/restore with a tested restore.
   - Branch: a needed decision is missing (SLOs, retention, RPO/RTO) -> ask the user and record it in `decisions.md`.
3. `backend-deploy`
   - Output: release pipeline with a gated migration step, release strategy, rollback procedure, post-deploy verification, and `deployment.md`.
   - Branch: the setup needs an environment decision not in `decisions.md` -> back to step 2 to record it first.
   - Branch: pipeline health checks fail on a real run -> re-run this step with the failure log.
4. `backend-doctor`
   - Output: full health check.

Readiness checklist (report each item as pass, fail, or not checked):

- Security review done; no open Critical or unaccepted High finding.
- Tests pass in CI; health checks and readiness probes exist.
- Logs, metrics, and alerts exist for errors, latency, and saturation, each alert with a runbook.
- Backups run, and a restore has been tested with a recorded result (via `backend-ops`).
- Rate limits and timeouts are set on public endpoints and outbound calls.
- Migrations run as a gated pipeline step; the rollback procedure is written down.
- Post-deploy verification is defined.
- Load test against the SLO: no skill owns this yet; mark it not checked unless the user provides results.

Done when the checklist is delivered and the user decides. The orchestrator never declares a service production-ready on its own.

## Memory Refresh

Use when memory may be out of date.

1. `backend-scan` with `scope=sync`
   - Output: updated memory files and a drift summary.
   - Branch: memory folder or project unreadable -> report the exact error and stop. A corrupt memory file is reported, never silently dropped.
2. `backend-doctor` (only if the user asked for a health check too)

Done when every memory file reflects the current codebase (or its problem is reported) and the drift summary is delivered.
