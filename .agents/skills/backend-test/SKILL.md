---
name: backend-test
description: "Own the testing workflow for backend projects: design test strategy, write tests, set up fixtures, mocking, coverage, and run suites. Use this skill when the user says 'test', 'testing strategy', 'write tests', 'coverage', 'fixtures', or wants to add, fix, expand, or run backend tests."
---

# Backend Test

## When to Activate

- User says "test", "write tests", "testing strategy", "coverage", "fixtures"
- Adding tests for new features, bug fixes, or refactors
- Existing tests are failing, slow, or missing
- Choosing or changing a test framework
- Reviewing coverage before deployment

## Prerequisites

See `_shared/context-loading.md` for standard prerequisites (project root check, manifest detection, memory file presence, fallback rules, and context priority list).

Add this test-specific prerequisite on top:
- REQUIRED: A test runner has been detected from the manifest or configuration (e.g., Jest, Vitest, pytest, `go test`, JUnit).
  - If missing: stop and ask the user to confirm the test runner or run `backend-scan` to detect it.

## Required Context

Follow the shared priority list in `_shared/context-loading.md` (Standard Required Context Priority List). For testing work, always load priority 6 (`test-strategy.md`) alongside the standard priorities 1-2. Load priority 4 (`api-patterns.md`) when writing contract or endpoint tests.

## mode=auto

Follow the shared `mode=auto` contract in `_shared/tool-rules.md`.

When the user says "run tests", "check tests", or "test", run in autonomous mode:

1. Run the Target Check below before any test command that is not provably unit-only. Run the tests without asking only when the check passes; otherwise ask first.
2. Execute the detected test command within `_shared/tool-rules.md` → Command Time Budgets. A run that does not complete is reported as "did not complete", never as passing.
3. Report results without asking for confirmation.
4. Ask for confirmation only if the intent appears to be adding new tests, or before changing any existing test's expectation (see Existing tests fail).

### Target Check

Run this check before every test command unless the command provably runs only hermetic unit tests: a dedicated unit script or path (e.g. `npm run test:unit`, `pytest tests/unit`) whose setup loads no `.env` or DB/queue config and that has no database hook (see the last bullet). A combined command such as `npm test`, `pytest`, `go test ./...`, or `./mvnw test` counts as an integration run for this check.

Inspect the environment and config the tests will load (`.env.test`, `.env`, test config files, `docker-compose*.yml`, CI test env, and the current shell environment) for database, queue, cache, mail, and external-API targets, e.g. `DATABASE_URL`, `DB_HOST`, `REDIS_URL`, `AMQP_URL`/`RABBITMQ_URL`, `KAFKA_BROKERS`, `SMTP_HOST`, `MONGODB_URI`, payment or email provider keys.

- Proceed automatically only if every target is provably local (see `_shared/tool-rules.md` → Production Targets): `localhost`, `127.0.0.1`, `::1`, `*.localhost`, a container this run started (e.g. via Testcontainers), or a file database under a temp directory.
- A host name containing `dev`, `staging`, or `test` is not proof. Unresolved variables count as not local.
- If any target is not provably local, or a live third-party key is configured, stop and ask. Suites that truncate tables or send messages must never run against shared data.
- Inspect test hooks for database commands: npm `pretest`/`posttest` scripts (npm runs them with `npm test`), Jest/Vitest `globalSetup`/`setupFiles`, pytest `conftest.py` fixtures, and Go `TestMain`. If any of them migrate, reset, seed, or push a schema (e.g. `prisma migrate reset --force`, `prisma db push`, `knex migrate:latest`, `alembic upgrade head`), ask first even for a local database (see `_shared/tool-rules.md` → Always Ask First).

## Test Strategy

Follow the test pyramid. Optimize for confidence and speed.

### Unit Tests

Test business rules in isolation.

- **Target**: services, use cases, domain models, pure functions
- **Rules**: one behavior per test, Arrange-Act-Assert, assert outputs and side effects, cover happy path + boundaries + every error branch

### Integration Tests

Test real infrastructure interactions.

- **Target**: repositories + real database, transaction boundaries, migration correctness, queues with test brokers
- **Rules**: use a real database when SQL/constraints matter, but only a local or ephemeral one (e.g. Testcontainers; see Target Check), roll back or truncate between tests, avoid retesting business rules

### Contract / E2E Tests

Test the request/response lifecycle.

- **Target**: HTTP endpoints, gRPC services, webhooks, CLI commands
- **Rules**: verify status codes, response shape, and error mapping; use the smallest surface; full browser E2E is rarely needed for APIs

### Anti-patterns

- Do not test the framework
- Do not assert internal call order unless it is a requirement
- Do not mock the unit under test
- Do not put business logic tests at the HTTP layer

## Fixtures & Test Data

Use deterministic, maintainable test data.

- **Factories**: build valid defaults, override only what matters, keep defaults realistic, avoid shared mutable state
- **Test database**: separate DB or schema, apply the project's existing migrations once per suite, only to a disposable local test DB (see `_shared/tool-rules.md` → Production Targets; otherwise ask first), clean up between tests, never rely on execution order
- **Seeds**: use only for integration/contract setup, document meaning, version with schema changes

## Mocking Strategy

Mock at architectural boundaries.

### Fake repositories

Replace persistence with an in-memory implementation of the repository interface.

```typescript
class FakeUserRepository implements UserRepository {
  users: User[] = [];
  async findByEmail(email: string) {
    return this.users.find(u => u.email === email) ?? null;
  }
  async create(user: User) {
    this.users.push(user);
    return user;
  }
}
```

### HTTP mocks

- Mock external clients at the adapter/port level
- Record real responses for stable contract tests when providers change rarely
- Avoid mocking the HTTP library itself unless transport behavior is the subject

### Time / ID fakes

Freeze time and inject deterministic clocks/ID generators.

```python
class FixedClock:
    def now(self):
        return datetime(2025, 1, 1, tzinfo=timezone.utc)
```

### What NOT to mock

- Do not mock the unit under test
- Do not mock value objects or pure functions
- Do not mock every dependency by default; prefer fakes for I/O boundaries

## Regression Tests

Every bug fix should start or end with a failing test.

1. Reproduce the bug with a test that fails against current code
2. Fix the code
3. Keep the test in the suite

### Characterization tests

When working with untested legacy code:

- Capture current behavior before changing it and name the test clearly
- Replace characterization tests with proper behavioral tests during refactoring
- Place regression tests near the code they protect

## Coverage Rules

Coverage is a signal, not a goal.

- Aim for high coverage on business logic and error branches
- Track trends, not absolute numbers
- Flag modules with 0% coverage or large uncovered branches
- Watch for tests that exercise code without asserting behavior, or high coverage with low confidence

### Practical thresholds

- **Unit tests**: target >80% on services and domain
- **Integration tests**: cover every repository method and transaction path at least once
- **Contract tests**: cover every endpoint, success and failure

## Running Tests

Use `bash` to run suites and interpret results.

### Detect the runner

Check `package.json`, `pyproject.toml`, `pytest.ini`, `go.mod`, or `Makefile`.

### Common commands

```bash
# Node.js / TypeScript
npm test
npm run test:unit
npm run test:integration

# Python
pytest
pytest tests/unit
pytest tests/integration

# Go
go test ./...
go test ./internal/...
```

### Interpret failures

- Read assertion message, stack trace, file, and line
- Group failures by root cause
- Fix the earliest failure in dependency order first
- Re-run only the failing file while debugging

### Flaky tests

Common causes: shared mutable state, time dependence, unordered collections, race conditions.
Fix by isolating state, freezing time, sorting comparisons, or adding synchronization.

## Decision Trees

### No tests exist

1. Run `backend-scan`
2. Start with unit tests for the most critical service or use case
3. Add one integration test for the most important repository flow
4. Add one contract test for the most important endpoint
5. Run the suite and iterate

### Existing tests fail

1. Run the failing suite with `bash` (after the Target Check, unless it is provably unit-only)
2. Classify each failure with evidence (assertion message, stack trace, recent diff):
   - **Implementation bug**: the code is wrong and the test is right. Fix the code, or hand the fix to `backend-implement`.
   - **Wrong expectation from an intended behavior change**: the test asserts old behavior that was deliberately changed. Show the expectation diff and the reason (the change or decision that made it), and ask before editing the test (see `_shared/tool-rules.md` → Test Integrity).
   - **Environment problem**: missing env vars, DB unreachable, missing test data, flakiness. Report it with the exact error; fix only local test setup you own, never by pointing tests at a non-local target.
3. Never skip, delete, mark xfail, loosen assertions of, or regenerate snapshots for a failing test to get green.
4. Re-run after each fix. If the same failure remains after two fix attempts, stop and report it instead of looping.
5. List every test file you modified in the summary, with the reason.

### Choosing a framework

Use the framework already in the project. If none exists:

- **Node.js**: Jest or Vitest for unit, Supertest for HTTP contract
- **Python**: pytest with factory-boy or faker
- **Go**: built-in `testing` plus `testify`
- **Java**: JUnit 5 with AssertJ

### Adding tests for a new feature

1. Write unit tests for the service/use case first
2. Add integration tests for DB-dependent behavior
3. Add contract tests for new endpoints
4. Run the full suite before finishing

### Low coverage on critical code

1. Identify uncovered business logic with coverage reports
2. Add tests for error branches and boundary conditions
3. Remove unreachable code when possible
4. Re-run coverage and verify improvement

## Tool Usage

Use OpenCode tools during testing work.

See `_shared/tool-rules.md` for the canonical tool-usage rules.

## Output Summary

When finished, report:

```markdown
## Test Work Summary

- Files created/modified: [list]
- Tests added: unit [N] / integration [N] / contract [N]
- Existing tests modified: [file → reason and user approval, or "none"]
- Not run / did not complete: [suite → reason, e.g. non-local DATABASE_URL, time budget]
- Coverage impact: [before] -> [after]
- Commands: `npm test`, `pytest tests/unit`, etc.
- Next steps:
  - [ ] Run full suite
  - [ ] Review flaky tests
  - [ ] Update memory with test conventions
```

Ask:
- "Should I expand coverage in a specific module?"
- "Should I update `.opencode/everything-backend-memory/` with the conventions I found?"

## Concurrent & Partial Work

Follow the shared checkpoint contract in `_shared/tool-rules.md` (Concurrent & Partial Work). This skill uses checkpoint path `.opencode/everything-backend-memory/.checkpoints/backend-test-<feature>-<YYYYMMDDTHHMMSSZ>.json` (Windows-safe UTC timestamp, no colons).

Test runs are normally idempotent, so checkpoints matter mainly when the user pauses mid-test-authoring (not mid-test-execution).
