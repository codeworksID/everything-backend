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

Before working with tests, confirm the following machine-checkable conditions:

- REQUIRED: A manifest file has been read (`package.json`, `pyproject.toml`, `go.mod`, `pom.xml`, `build.gradle`, etc.).
  - Check: `bash -c 'ls package.json pyproject.toml go.mod pom.xml build.gradle 2>/dev/null | head -1'`
  - If missing: stop and ask the user for the correct project path that contains a known manifest
- REQUIRED: A test runner has been detected from the manifest or configuration.
  - Check: `bash -c 'ls package.json pyproject.toml go.mod pom.xml build.gradle 2>/dev/null | head -1' && grep -E "test|jest|pytest|go test" package.json pyproject.toml go.mod 2>/dev/null | head -1`
  - If missing: stop and ask the user to confirm the test runner or run `backend-scan` to detect it
- RECOMMENDED: Memory files exist in `.opencode/everything-backend-memory/`.
  - Check: `glob .opencode/everything-backend-memory/*.md`
  - If missing: run `backend-scan` to populate memory, or proceed with manifest-only context if the user confirms

If any REQUIRED Check fails, run `backend-scan` with `mode=auto`, then re-run these checks. If the missing file is a project file (e.g., manifest, source dir) that `backend-scan` cannot create, stop and ask the user.

## Required Context

Read memory files in this priority order:

1. `tech-stack.md` — languages, frameworks, test runners (highest priority)
2. `api-patterns.md` — endpoints, contracts, error shapes
3. `project-overview.md` — project type and module boundaries
4. `db-schema.md` — tables, relationships, invariants
5. `decisions.md` — architecture that affects testability

If memory is stale, run `backend-scan` first.

## mode=auto

When the user says "run tests", "check tests", or "test", run in autonomous mode:

1. Execute the detected test command immediately.
2. Report results without asking for confirmation.
3. Ask for confirmation only if the intent appears to be adding new tests.

## Test Strategy

Follow the test pyramid. Optimize for confidence and speed.

### Unit Tests

Test business rules in isolation.

- **Target**: services, use cases, domain models, pure functions
- **Rules**: one behavior per test, Arrange-Act-Assert, assert outputs and side effects, cover happy path + boundaries + every error branch

### Integration Tests

Test real infrastructure interactions.

- **Target**: repositories + real database, transaction boundaries, migration correctness, queues with test brokers
- **Rules**: use a real database when SQL/constraints matter, roll back or truncate between tests, avoid retesting business rules

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
- **Test database**: separate DB or schema, run migrations once per suite, clean up between tests, never rely on execution order
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

1. Run the failing suite with `bash`
2. Determine if failures are from recent changes, environment, or flakiness
3. Fix environment issues first (env vars, DB connection, test data)
4. Fix code bugs or update tests that are now invalid
5. Re-run until green

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

This skill participates in the shared checkpoint contract defined in `_shared/tool-rules.md` (Concurrent & Partial Work).

### Checkpoint
- File: `.opencode/everything-backend-memory/.checkpoints/backend-test-<ISO-timestamp>.json`
- Required fields:
  - `feature_slug`: user-provided or auto-derived identifier for the change set (e.g., `user-registration`, `order-cancel`).
  - `started_at`: ISO-8601 timestamp.
  - `completed_steps`: array of step names already finished.
  - `pending_steps`: array of step names still to run.
  - `generated_files`: array of file paths this run created or modified.
  - `memory_updates`: array of memory files this run appended to.

### Resume
1. On start, run `glob .opencode/everything-backend-memory/.checkpoints/backend-test-*.json`.
2. If a checkpoint exists, ask the user: "Resume from `<pending_steps[0]>` or start over?"
   - In `mode=auto`, default to "resume" unless the checkpoint is older than 24 hours, in which case start over (and move the old checkpoint to `.checkpoints/archive/`).
3. If resuming, re-load the checkpoint and skip `completed_steps`.
4. Test runs are normally idempotent; a checkpoint is mostly useful when the user paused mid-test-authoring (not mid-execution).

### Rollback
1. Read the checkpoint's `generated_files` list.
2. For each file, present `git checkout -- <file>` as the rollback command. Never run destructive deletions automatically.
3. After the user confirms, run the listed `git checkout` commands and delete the checkpoint file.
4. If a file was added (not just modified), suggest `git rm` or `rm` for the user to run, but do not execute it.

### Multi-feature isolation
- Every run MUST set a `feature_slug` before any write operation. If the user did not provide one, derive it from the first relevant file or ask.
- Two concurrent runs of this skill with different `feature_slugs` must run in isolation — they do not share checkpoints or generated file lists.
- Two concurrent runs with the SAME `feature_slug` are a collision: refuse to start and tell the user to either wait or pick a different slug.

### Partial completion
- If the run stops after some `generated_files` have been written but before all `pending_steps` finish, the checkpoint must still be saved.
- On the next invocation, the resume step above applies. The user can pick which `pending_steps` to redo or skip.
