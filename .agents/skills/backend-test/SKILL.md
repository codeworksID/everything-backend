---
name: backend-test
description: "Designs the test strategy for a backend project and writes, runs and repairs its automated tests: unit, integration and API contract tests, fixtures, factories, mocks, test databases and coverage. Use it when the user says test, write tests, add tests for this endpoint or feature, run the tests, a test is broken or flaky (when the code under test is wrong, backend-debug fixes it), coverage, test plan, test strategy, fixtures or mocking, or when backend-debug, backend-auth or backend-refactor need a failing bug-reproduction test, a negative-test matrix or a test baseline. It runs integration suites only after checking that every database, queue and external target is local, never skips or weakens a failing test to get green, and records runners, conventions and the coverage target in test-strategy.md. It does not fix production bugs (backend-debug) or build features (backend-implement)."
---

# Backend Test

Give the project a test suite that catches real regressions, runs safely, and reports honest results.

## When to Use

- The user wants tests written, run, expanded, or repaired, or asks about coverage or test strategy.
- A feature, auth change, or refactor needs tests (new tests, a negative-test matrix, or a baseline).
- `backend-debug` asks for a failing test that reproduces a bug.
- Tests are failing, slow, flaky, or missing, or a test framework must be chosen.

Not for: fixing production bugs (`backend-debug`), building features (`backend-implement`), behavior-preserving restructuring (`backend-refactor`), or execution-based health checks (`backend-doctor`). backend-test writes and changes test code, test config and fixtures only.

## Before You Start

1. Resolve the shared docs folder ("<shared>"): first `_shared/` inside this skill's folder (bundled installs), then `../_shared/` next to it; other fallbacks are in `<shared>/context-loading.md` -> Resolving `_shared/` Files. A missing shared doc is a warning, not a stop.
2. Read `<shared>/tool-rules.md` (mode=auto contract, Production Targets, Test Integrity, Command Time Budgets, checkpoints) and `<shared>/host-tools.md` if the actions below don't map clearly to your host's tools. Read `<shared>/memory-schema.md` -> test-strategy.md before writing that file.
3. Load project memory per `<shared>/context-loading.md`: priorities 1-2 always, 6 (`test-strategy.md`) always, 3 (`db-schema.md`) for integration tests, 4 (`api-patterns.md`) for endpoint or contract tests, and `issues.md` for intents repair and reproduce. If memory is missing, run `backend-scan` first when possible; otherwise continue from the manifests and say so in the summary.
4. If the detected stack matches a file in `<shared>/stacks/`, read it (its Testing and Local and Test Setup sections in particular).

## Inputs

- Run mode: `mode=auto` or `mode=interactive`, as defined in `<shared>/tool-rules.md` -> `mode=auto` Contract. This skill does not redefine it.
- `feature=<slug>`: names the checkpoint when files are written (e.g. `feature=user-registration`). Derive a short kebab-case slug from the request if the caller gives none.
- Intent, inferred from the request: **run** (run and report), **write** (tests for a feature or module), **repair** (failing tests), **coverage** (find and close gaps), **bootstrap** (no tests yet), **reproduce** (bug-reproduction test for `backend-debug`), or **matrix** (a table of required cases handed over by `backend-auth`, `backend-db-design` or `backend-api-design`).
- Optional scope: module, path, or endpoint list.

## Rules

- **Target Check before every non-hermetic run.** See the section below. It is part of the contract, not optional.
- **Test Integrity** (`<shared>/tool-rules.md` -> Test Integrity): never skip, delete, mark xfail/pending, loosen, or re-snapshot a failing test to get green. A genuinely wrong expectation is changed only after showing the diff and the reason and getting a yes.
- **Do not change production code.** An implementation bug found by a test goes to `backend-debug` (or to `backend-implement` when it is a missing feature) with the failing test and the evidence.
- **Never invent numbers.** Test counts, pass/fail and coverage come from command output. A check that did not run is reported as "not run" or "did not complete" with the reason.
- **Installing a runner, coverage tool or test library is Always Ask First.** Propose the exact command once.
- **Recordings and fixtures carry no secrets.** Scrub tokens, keys, cookies and personal data from recorded HTTP responses and seed files.

## Target Check

Run this check before every test command unless the command provably runs only hermetic unit tests: a dedicated unit script or path (e.g. `npm run test:unit`, `pytest tests/unit`) whose setup loads no `.env` or DB/queue config and that has no database hook (see the last bullet). A combined command such as `npm test`, `pytest`, `go test ./...`, `./mvnw test`, or `./gradlew test` counts as an integration run for this check.

Inspect the environment and config the tests will load (`.env.test`, `.env`, test config files, `docker-compose*.yml`, CI test env, and the current shell environment) for database, queue, cache, mail, and external-API targets, e.g. `DATABASE_URL`, `DB_HOST`, `REDIS_URL`, `AMQP_URL`/`RABBITMQ_URL`, `KAFKA_BROKERS`, `SMTP_HOST`, `MONGODB_URI`, payment or email provider keys.

- Proceed automatically only if every target is provably local (see `<shared>/tool-rules.md` -> Production Targets): `localhost`, `127.0.0.1`, `::1`, `*.localhost` served by a local process or container (not a tunnel or port-forward), a container this run started (e.g. via Testcontainers), or a file database under a temp directory.
- A host name containing `dev`, `staging`, or `test` is not proof. Unresolved variables count as not local.
- If any target is not provably local, or a live third-party key is configured, stop and ask. Suites that truncate tables or send messages must never run against shared data.
- Inspect test hooks for database commands: npm `pretest`/`posttest` scripts (npm runs them with `npm test`), Jest/Vitest `globalSetup`/`setupFiles`, pytest `conftest.py` fixtures, Go `TestMain`, and Maven/Gradle test tasks wired to Flyway or Liquibase. If any of them migrate, reset, seed, or push a schema (e.g. `prisma migrate reset --force`, `prisma db push`, `knex migrate:latest`, `alembic upgrade head`) against anything other than a disposable database this run started, ask first even for a local database (see `<shared>/tool-rules.md` -> Always Ask First).

A guard "allow" (`<shared>/scripts/guard.js` or the Claude Code hook) never replaces this check: guard cannot see where `DATABASE_URL` points.

## Workflow

### Step 1: Detect the runner and current state

1. Find the runner, package manager, test layout and existing scripts from manifests, lockfiles and test config (`references/frameworks-and-commands.md` -> Detect the Runner).
2. Read `test-strategy.md` if present: commands, test database setup, coverage tool, metric and target, known failures.
3. If no runner exists (bootstrap): propose one per `references/frameworks-and-commands.md` -> Choosing a Framework, with the exact install command. Installing is Always Ask First; in `mode=auto` without a user, write the plan and stop before installing.

Output: runner, commands (all, unit-only, single file, coverage), layout. Done when each command is known or marked unknown with the reason.

### Step 2: Run the Target Check

Classify every command you plan to run as hermetic-unit or integration, then run the Target Check above for each integration command. Record the resolved targets for the summary.

Done when every planned command is either cleared to run or marked "ask first" with the target that blocked it.

### Step 3: Plan the tests

Pick the layer for each behavior. Optimize for confidence and speed:

| Layer | Target | Rules |
|---|---|---|
| Unit | services, use cases, domain models, pure functions | one behavior per test; Arrange-Act-Assert; assert outputs and side effects; happy path, boundaries and every error branch |
| Integration | repositories with a real database, transaction boundaries, migrations, queues with a test broker | real DB only when SQL or constraints matter, and only a local or ephemeral one; isolate each test (rollback, truncate, or per-worker DB); do not retest business rules |
| Contract / API | HTTP endpoints, gRPC, webhooks, CLI commands | status codes, response shape and error mapping; validate responses against the OpenAPI spec when one exists; smallest surface that proves it; full browser E2E is rarely needed for APIs |

Add the cases that matter for the code under test:

- Endpoints with auth: the 401/403/ownership/tenant matrix in `references/api-and-auth-tests.md`. When `backend-auth` or `backend-db-design` hands over a matrix, every row becomes a test.
- Endpoints that take user-controlled search, filter, sort, id or free-text parameters, or that read or write tenant- or user-owned rows: the security negative tests in `references/security-tests.md` (SQL and NoSQL injection payloads, LIKE wildcards, sort allowlist, cross-tenant ids). They are required by `<shared>/sql-safety.md` -> Verification, and a failing one is an implementation bug for `backend-debug`, never a test to loosen.
- Endpoints that accept bodies, files, URLs, redirect targets, webhooks or tokens: the matching tests in `references/security-tests.md` -> Beyond SQL (mass assignment, oversized bodies, path traversal, SSRF, command and template payloads, open redirect, webhook signature and replay, JWT `alg: none`/expired/wrong audience, rate limits), required by `<shared>/secure-coding.md` -> Verification, step 4.
- Consumers, jobs, webhooks, idempotency keys, and code with concurrent writers: `references/async-and-concurrency-tests.md`.
- Intent **reproduce**: one test that fails on current code for the reported reason (Step 6 has the handoff).
- Intent **coverage**: start from the coverage report, not a guess; target uncovered business logic and error branches.

Anti-patterns: testing the framework; asserting internal call order that is not a requirement; mocking the unit under test; business-rule tests at the HTTP layer.

Output: a list of tests to add or change, grouped by layer. In `mode=interactive`, show it and wait. Done when every requested behavior has at least one planned test.

### Step 4: Write the tests

1. Start a checkpoint before the first edit: `node <shared>/scripts/checkpoint.js start --skill backend-test --feature <slug>`. If it exits 3, an open checkpoint exists: offer resume or restart (`--restart`); in `mode=auto` with no user, resume. Record each file you create or edit (`checkpoint.js record --created ... --modified ...`), snapshot after each step, and close it when done. If Node is unavailable, follow `<shared>/tool-rules.md` -> Concurrent & Partial Work by hand.
2. Follow the project's existing test style, naming and folder layout. Place tests near the code they protect, or where the project's convention puts them.
3. Use factories and fakes per `references/fixtures-and-mocking.md`. Mock at architectural boundaries only.
4. If a test needs a database and none is set up, provision a disposable one per `references/fixtures-and-mocking.md` -> Test Database. Applying migrations to a database this run started needs no confirmation; any other database does.
5. Check LSP diagnostics if available, or run the type-checker, on the files you wrote.

Done when every planned test exists and type-checks.

### Step 5: Run, classify and fix test-side problems

1. Run the narrowest command first (single file or test), then the full suite. Respect `<shared>/tool-rules.md` -> Command Time Budgets; a run that does not finish is "did not complete", never passing.
2. Before your changes, note pre-existing failures (run the suite once first, or use `test-strategy.md` -> Flaky Tests and open test issues in `issues.md`). They are reported, not hidden, and not counted as your regressions.
3. Group failures by root cause and work on the earliest failure in dependency order first (e.g. a broken fixture or setup before the tests that use it). While debugging, re-run only the failing file.
4. Classify each failure with evidence (assertion message, stack trace, recent diff):
   - **Test bug in a test you wrote this run**: fix the test so it asserts the intended behavior. Never fix it by weakening the assertion.
   - **Implementation bug** (code wrong, test right): stop working on that test. Hand it to `backend-debug` with the test, the failure output, and the suspected location.
   - **Wrong expectation from an intended behavior change** in an existing test: show the expectation diff and the change or decision behind it, and ask before editing (Test Integrity).
   - **Environment problem** (missing env var, DB unreachable, missing test data): report the exact error. Fix only local test setup you own; never point tests at a non-local target.
   - **Flaky** (passes and fails on the same code): see `references/frameworks-and-commands.md` -> Flaky Tests. Do not add retries to hide it.
5. Record every test file you change in the checkpoint (`checkpoint.js record --modified ...`). Re-run after each fix. If the same failure remains after two fix attempts, stop and report it instead of looping.

Done when the full suite has run to completion and every failure is classified.

### Step 6: Measure coverage and hand off

1. Coverage: run the stack's coverage command (`references/frameworks-and-commands.md` -> Coverage Commands) with the metric and scope recorded in `test-strategy.md`, before and after your changes. If the tool is not installed, report coverage as "not measured" and propose the install.
2. Intent **reproduce**: return to `backend-debug` the test path and name, the run command, and the failure output showing it fails for the reported reason. Do not fix the bug.
3. Intent **matrix**: report each row of the handed-over matrix as passing, failing (with output), or not applicable (with why).

Compare the result with `test-strategy.md` -> Coverage Target, or the default targets in `references/frameworks-and-commands.md` when none is set. Do not change the stored target unless the user asks.

Done when coverage is reported from command output (or as "not measured") and every handoff has its evidence attached.

### Step 7: Update memory and report

1. Create or update `test-strategy.md` per `references/memory-and-report.md` (runners and commands, layout, test database, fixtures and mocking conventions, coverage target and latest result, flaky tests). Record it with `node <shared>/scripts/checkpoint.js record --skill backend-test --feature <slug> --memory test-strategy.md` (skip when intent **run** opened no checkpoint).
2. For implementation bugs handed to `backend-debug`, add an entry to `issues.md` if the caller has not, following `<shared>/memory-schema.md` -> issues.md.
3. Close the checkpoint: `node <shared>/scripts/checkpoint.js close --skill backend-test --feature <slug>`.
4. Report with the Test Work Summary in `references/memory-and-report.md`.

## Exit Criteria

The run is complete when all of these hold:

- The full suite ran to completion with a recorded exit code, or the summary says exactly which suites did not run or did not complete and why (e.g. non-local `DATABASE_URL`, time budget, missing tool).
- Every test added this run exists, runs, and either passes or is a deliberate failing reproduction handed to `backend-debug`.
- Every failure is classified (test bug fixed, implementation bug handed off, expectation change approved, environment problem, flaky, or pre-existing).
- No test was skipped, deleted, loosened, or re-snapshotted to get green, and every modified existing test is listed with its reason and approval.
- Coverage before and after is reported from command output, or reported as "not measured".
- `test-strategy.md` reflects the commands and conventions used, and the checkpoint is closed.

For intent **run**, only the first, third and fourth bullets apply (no files are written, so no checkpoint).

## Edge Cases

- **No tests exist**: bootstrap with one unit test for the most critical use case, one integration test for the most important repository flow, and one contract test for the most important endpoint. Run them, then grow from there.
- **Untested legacy code before a refactor**: write characterization tests that capture current behavior, named as such (e.g. `characterization: returns 0 for empty cart`). Replace them with behavioral tests after the refactor is verified.
- **Bug fix request without backend-debug**: write the reproduction test, confirm it fails for the right reason, then hand off. A fix is verified when that test fails before the fix and passes after.
- **Monorepo**: run tests per package with the workspace's own commands; report results per package.
- **No Docker for Testcontainers**: say so and fall back to a disposable local database, never a shared one.
- **No shell (e.g. Claude.ai without code execution)**: write the tests, give the user the exact commands, and report every run as "not run".

## References

- `references/frameworks-and-commands.md`: read in Steps 1, 5 and 6 to detect the runner and package manager, for run and single-test commands per stack, coverage commands and metrics, choosing a framework, and flaky-test handling.
- `references/fixtures-and-mocking.md`: read in Step 4 when writing factories, fakes, HTTP or time mocks, or setting up a disposable test database and per-test isolation.
- `references/api-and-auth-tests.md`: read when testing endpoints, contract conformance against an OpenAPI spec, or authentication and authorization (401/403, ownership, tenant isolation, token cases).
- `references/security-tests.md`: read when the feature takes user-controlled query parameters (search, filter, sort, id, free text, JSON filter bodies) or touches tenant- or user-owned data, for injection and cross-tenant negative tests in Vitest + Supertest and pytest + httpx. Rules come from `<shared>/sql-safety.md` and `<shared>/secure-coding.md`.
- `references/async-and-concurrency-tests.md`: read when testing queue consumers, retries and DLQs, webhooks, scheduled jobs, idempotency keys, concurrent writes, or transaction rollback.
- `references/memory-and-report.md`: read in Step 7 for the test-strategy.md entry format and the Test Work Summary template.
