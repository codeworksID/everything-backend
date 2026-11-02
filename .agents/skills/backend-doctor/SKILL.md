---
name: backend-doctor
description: "Runs execution-based health checks on an existing backend: build, tests, coverage, lint and type checks, dependency audits, a local smoke test, and a scan for obvious code anti-patterns, then reports evidence-backed findings with severities and the skill that should fix each one. Diagnose-only: it never edits code or installs packages. Use it when the user says check my backend, run doctor, health check, review my code, what's wrong with this service, or before a release or after a large change. Supports mode=review to check only the files changed against the base branch, for example a pull request. Not for a security review, threat model or OWASP audit (use backend-security), fixing a specific bug (backend-debug), or adding health endpoints (backend-ops)."
---

# Backend Doctor

Run the project's own checks, collect evidence, and report what is wrong, how bad it is, and which skill should fix it. Doctor diagnoses. It does not fix.

## When to Use

- "Check my backend", "health check", "run doctor", "review my code", "what's wrong with this service".
- Before a release, at the end of an orchestrator workflow, or after a large change or refactor.
- `mode=review`: review a branch or pull request, scoped to the changed files.

Not for:

- Security review, threat modeling, OWASP API Top 10, secret history scans, supply chain: backend-security. Doctor runs the dependency audit and flags obvious static issues, then recommends backend-security.
- Fixing a known bug or a performance regression: backend-debug.
- Adding health routes, metrics, timeouts or retries: backend-ops.

## Before You Start

1. Resolve the shared docs folder ("<shared>"): first `_shared/` inside this skill's folder (bundled installs), then `../_shared/` next to it; other fallbacks are in `<shared>/context-loading.md` -> Resolving `_shared/` Files. A missing shared doc is a warning, not a stop.
2. Read `<shared>/tool-rules.md` (mode=auto contract, Production Targets, Test Integrity, Command Time Budgets, checkpoints) and `<shared>/host-tools.md` if the actions below don't map clearly to your host's tools. Read `<shared>/principles.md` (what findings are measured against) and the issues.md section of `<shared>/memory-schema.md`.
3. Load project memory per `<shared>/context-loading.md`: always `project-overview.md` and `tech-stack.md`; `api-patterns.md` and `db-schema.md` when the project has endpoints or a database; `test-strategy.md` if it exists; `decisions.md` only when a finding contradicts or depends on a recorded decision. Also load `issues.md` if it exists, to check known issues. A missing `issues.md` is normal; doctor creates it in Step 9. If all memory is missing, follow the Missing-Memory Rule there (in `mode=auto`, run backend-scan first).
4. If the detected stack matches a file in `<shared>/stacks/`, read it.

Doctor-specific checks:

- A manifest or source folder exists. If not, stop and ask for the project path; doctor has nothing to check.
- Without a shell (e.g. some sandboxes), do the static checks only, report every dynamic check as "not run: no shell", and give the user the exact commands.

## References

- `references/commands.md`: read in Step 1 to pick test, coverage, build, lint, audit and migration-status commands per stack, package manager and Python environment.
- `references/smoke-test.md`: read before Step 6 (start command, port, health route discovery, Bash and PowerShell start/poll/stop).
- `references/static-checks.md`: read before Step 7 (injection sinks per stack, owner-predicate (BOLA) check, secret search and masking, bandit flags, architecture, performance and resilience checks).
- `<shared>/sql-safety.md`: read before Step 7. It is the source of truth for what counts as safe data access and for injection and BOLA severity.
- `references/output-format.md`: read in Step 8 (the output template, the grading rubric and recommendation patterns per finding type).

## Inputs

- Run mode: `mode=auto` (default) or `mode=interactive`, exactly as defined in `<shared>/tool-rules.md` -> `mode=auto` Contract.
- `mode=review` (optional) selects diff scope. It is a scope, not a run mode: the run is still auto unless the user asks for interactive. Optional `base=<branch>`.
- `path=<dir>` (optional): the service to check in a monorepo.

## Rules

- **Diagnose only.** Doctor does not edit source, tests, config or manifests, and never installs, upgrades or removes packages (no `npm audit fix`, no `npx` downloads, no `pip install`). Its only writes are `issues.md` and, if the user asks, a saved copy of the output.
- **Every finding names a Next skill** that owns the fix (backend-implement, backend-auth, backend-debug, backend-test, backend-migrate, backend-ops, backend-deploy, backend-refactor, backend-security). Doctor applies a fix only if the user asks for that specific fix after seeing the findings; prefer handing it to the owning skill.
- **Evidence or it did not happen.** A check that failed to run, was skipped, or timed out is reported as "not run" or "did not complete" with the reason, never as a pass.
- **Mask secrets** everywhere: show kind, location, first 4 characters and length only (see `references/static-checks.md` -> Masking).
- **No production targets.** Tests, the smoke test and migration status run only after the Target Check passes.

## Severity

This is the scale for doctor's findings. Other skills (backend-ops, the orchestrator's gates) refer to it.

| Severity | Examples |
|---|---|
| Critical | Failing build; authentication bypass; confirmed injection (SQL, NoSQL, command, template) or a missing owner predicate on an owned row, when reachable from a public or low-privilege endpoint (High otherwise, per `<shared>/sql-safety.md`); a committed live secret; data-loss or broken-invariant risk; a known exploitable vulnerability in a production dependency |
| High | Failing tests on critical paths (auth, payments, persistence); missing ownership or authorization check (Critical when reachable from a public or low-privilege endpoint, per `<shared>/sql-safety.md` -> Verification); missing validation on create, update, auth or payment endpoints; high-severity vulnerability in a production dependency; app fails to start from a code error; health route returns non-2xx; pending or diverged migrations; god service or business rules duplicated across endpoints; type errors that can fail at runtime |
| Medium | Weak layering; N+1 or unbounded queries; inconsistent error mapping; missing health route; outbound calls without timeouts; environment or setup failures; flaky tests; vulnerabilities in dev-only dependencies; missing tests on critical paths; a tool that is missing or failed to run (category "Tooling") |
| Low | Naming, documentation, minor duplication, cosmetic lint warnings, non-critical observability gaps |

Legacy code: keep the scale; group many Low findings into one entry instead of listing each.

## Workflow

### Step 1: Plan the run

1. Read the manifests and lockfiles. Pick commands from `references/commands.md`, preferring the project's own scripts. Read each script body you plan to run.
2. Note what is not configured (no coverage tool, no linter, no health route). Those become "not run" entries or recommendations, not installs.
3. In `mode=review`, build the file list first (see Review Mode below).

Done when: you have a list of commands, each marked hermetic or integration.

### Step 2: Target Check

Before Step 3 (tests), Step 6 (smoke test) or a migration-status command, read what the process will load: `.env`, `.env.test`, config files, `docker-compose*.yml`, test setup files, and the current shell environment. List every database, queue, cache, mail, SMS, payment and external-API target (e.g. `DATABASE_URL`, `DB_HOST`, `REDIS_URL`, `AMQP_URL`, `RABBITMQ_URL`, `KAFKA_BROKERS`, `SMTP_HOST`, provider keys).

- Run automatically only if every target is provably local per `<shared>/tool-rules.md` -> Production Targets. Names containing `dev`, `staging` or `test` are not proof. An unresolved target counts as production.
- Every test command is an integration run unless it provably runs only hermetic unit tests (a dedicated unit script or path that loads no `.env` and no DB or queue config). `npm test`, `npm run test:ci`, `pytest`, `go test ./...` and `./mvnw test` count as integration runs.
- Check for automatic migrate, reset or seed: app hooks (`prestart`, migrate-on-boot settings) and test hooks (npm `pretest`, Jest or Vitest `globalSetup` / `setupFiles`, pytest `conftest.py` fixtures, Go `TestMain`), e.g. `prisma migrate reset --force`, `prisma db push`, `knex migrate:latest`, `alembic upgrade head`. If any exists, ask first even for a local database (Always Ask First).
- If a target is not provably local, skip that check, record "not run: non-local target <name>", and ask whether to run it.

Done when: each integration command is marked run, ask, or skip, with the target it resolved.

### Step 3: Tests and coverage

Run the test command (the coverage variant if coverage is configured). Capture the exit code, failure count, failing test names and assertions. Classify each failure as environment, flaky or code (see `references/commands.md` -> Classifying failures) before rating it. Follow Test Integrity: never skip, edit or loosen a test.

Done when: results and coverage (or "coverage: not measured") are recorded.

### Step 4: Build, lint and type checks

Run the build, linter, formatter check and type-checker. Check LSP diagnostics on the source folders if available; without LSP, the type-checker is the evidence. Rate type errors that can fail at runtime High, lint failures on critical paths Medium, cosmetic warnings Low.

Done when: each tool has an exit code or a "not configured" note.

### Step 5: Dependency audit

Audit production dependencies separately from dev dependencies (`references/commands.md` -> Dependency Audits). For each vulnerability record package, installed version, fixed version and whether it is production or dev. Recommend upgrades with the fixed version and any breaking changes; installing or upgrading always needs confirmation and belongs to the Next skill.

Done when: production and dev results are recorded separately, or the audit is "not run" with the reason.

### Step 6: Smoke test

If there is a start command and the Target Check passed, follow `references/smoke-test.md`: find the port and the real health route, start in the background, poll up to about 60s, probe, then stop the whole process tree and confirm the port is free. Optionally run the read-only migration-status command for the project's migration tool.

Done when: the probe result is recorded and no process this run started is still running.

### Step 7: Static checks

Follow `references/static-checks.md`, judging data-access hits against `<shared>/sql-safety.md`. Search for candidates, read each hit in context, and report only confirmed findings. Cover injection sinks (SQL, NoSQL operator, command, template), reads and writes of owned rows without an owner predicate (candidate BOLA, hand to backend-security), secrets in the working tree, missing validation and obvious ownership gaps, layering and architecture, performance (static only) and resilience. Anything that needs a deeper security look goes to "Needs review (backend-security)".

Done when: every confirmed finding has a file, line and evidence excerpt.

### Step 8: Compare with known issues and write the output

1. For each Open or In Progress entry in `issues.md`, check whether this run shows it fixed (Resolved), still present (Open), or back after being Resolved (Regressed, High at least).
2. Write the output with `references/output-format.md`. Each finding has: file and line, the command or search that produced it, a 2 to 10 line excerpt (secrets masked), severity and category, the principle it violates, a recommendation (with a code example when useful), and the Next skill.
3. Grade categories with the rubric there. Unrun checks make a category "Not assessed", never a pass.

Done when: the output covers every check from Step 1, including the ones not run.

### Step 9: Persist findings

Start a checkpoint before the first write: `node <shared>/scripts/checkpoint.js start --skill backend-doctor --feature <slug>` (slug `health-check`, or `review-<branch>` in review mode). On exit code 3, resume the open checkpoint. Then:

1. Append each new Critical, High and Medium finding to `.opencode/everything-backend-memory/issues.md` in the `memory-schema.md` format. Skip findings that already have an entry for the same location and problem; update that entry's Status instead (Resolved with a short note, or Open again with "Regressed on <date>"). Never copy secret values.
2. Update `## Last Updated`.
3. Record the file (`checkpoint.js record ... --memory issues.md`), snapshot, and close with `--status completed`.
4. If the user asked for a saved copy, write it to `docs/health/doctor-<YYYYMMDD>.md` and record it with `--created`.

If Node is unavailable, follow `<shared>/tool-rules.md` -> Concurrent & Partial Work by hand. In `mode=interactive`, show the issues.md diff and wait for approval first.

Done when: issues.md reflects this run and the checkpoint is closed.

## Review Mode

`mode=review` checks only what a branch changes.

1. Base: `base=<branch>` if given, else the remote default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`), else `main` or `master`. Do not fetch; if the local base may be stale, say so.
2. Files: `git diff --name-only --diff-filter=ACMR <base>...HEAD`, plus uncommitted changes (`git diff --name-only HEAD`) and untracked files (`git ls-files --others --exclude-standard`). Skip deleted, generated and vendored files.
3. Checks:
   - Lint and type-check the changed files where the tool accepts paths; otherwise run it fully and keep only results in changed files.
   - Tests: run the tests related to the changed files if the runner supports it (e.g. `vitest related`, `jest --findRelatedTests`), else the full suite. The Target Check still applies.
   - Dependency audit only if a manifest or lockfile changed.
   - Static checks on the changed files, focused on changed lines.
   - Changed migration files: flag them for backend-migrate review (expand/contract order, locks, NOT NULL and index safety).
   - Changes to auth, sessions, crypto, access control or new public endpoints: recommend a backend-security review.
4. Report findings in changed lines first. List pre-existing problems you noticed in the same files under "Outside the diff" without grading them. Skip the smoke test unless the user asks.

Done when: each changed file is either checked or listed as skipped with a reason.

## Edge Cases

- **No memory and no code**: stop and ask for the project path.
- **Large codebase**: run the global commands, then sample static checks on critical paths (auth, payments, persistence, public endpoints) and say what was sampled.
- **Multiple languages or services**: check each separately with its own commands; one output with a section per service.
- **Missing tool**: report it as a Medium "Tooling" finding with the exact error and the setup command; try an alternative from `references/commands.md` that needs no install.
- **Long-running check**: follow Command Time Budgets; report "did not complete" with the elapsed time and partial output.
- **Fix requested**: hand the finding to its Next skill. Re-run doctor afterwards to confirm.
