# Fixtures, Test Data and Mocking

Read this when writing factories or fakes, mocking HTTP or time, or setting up a disposable test database. Stack-specific setups (Testcontainers fixtures, transaction-rollback sessions) are in `<shared>/stacks/` when the stack has a file there.

## Factories

Build valid defaults; override only what the test cares about.

```typescript
let seq = 0;
export function buildUser(overrides: Partial<User> = {}): User {
  seq += 1;
  return {
    id: `user-${seq}`,
    email: `user${seq}@example.test`,
    name: "Test User",
    role: "member",
    createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}
```

```python
import factory

class UserFactory(factory.Factory):
    class Meta:
        model = User
    id = factory.Sequence(lambda n: n + 1)
    email = factory.Sequence(lambda n: f"user{n}@example.test")
    role = "member"
```

Rules:

- Defaults are realistic and valid; each test sets only the fields its assertion depends on.
- Unique values (emails, slugs) come from a sequence, not a shared constant, so tests can run in parallel.
- No shared mutable fixtures between tests. Build fresh objects per test.
- Use reserved domains (`example.test`, `example.com`) and obviously fake data. Never copy production records into fixtures.
- Seeds are for integration and contract setup only. Document what each seed means and update it with schema changes.

## Test Database

Use a real database when SQL, constraints, locking or JSON behavior matter. It must be disposable and local (see the Target Check in SKILL.md).

Provisioning, in order of preference:

1. **Testcontainers**: the test run starts the container, gets its connection string, applies the project's real migrations to it, and stops it at the end. Use the same database major version as production. Migrations against a database this run started need no confirmation.
2. **Compose test profile**: a `docker-compose.test.yml` (or a `test` profile) with a throwaway database on a local port and no named volume. Start it before the run and stop it after (`docker compose -f docker-compose.test.yml down`; add `-v` only for volumes this run created). Check what listens on the port before trusting it as local.
3. **CI service containers**: a database service in the CI job. Editing CI config is Always Ask First; propose the change.
4. **SQLite or in-memory database**: only when production also uses it. Otherwise behavior differs (types, locking, constraints) and tests give false confidence.

If Docker is not available, say so. Use a disposable local database the user confirms; never a shared one.

Run the real migration files, not a schema dump, so migrations are tested too.

### Per-test isolation

Pick one approach per suite and apply it consistently:

| Approach | How | Notes |
|---|---|---|
| Transaction rollback | Open a transaction (or savepoint) per test, roll back after. Django `TestCase`, Rails transactional tests, Spring `@Transactional` on the test class, SQLAlchemy savepoint session (see `<shared>/stacks/python-fastapi.md`) | Fastest. Does not work when the code under test opens its own connection or commits on another connection |
| Truncate | Truncate touched tables after each test (PostgreSQL: `TRUNCATE ... RESTART IDENTITY CASCADE`) | Works with any ORM, including ones without nested transactions |
| Database or schema per worker | One database or schema per parallel worker (`JEST_WORKER_ID`, `VITEST_POOL_ID`, pytest-xdist `worker_id`), or a template database copied per worker | Needed when tests run in parallel against one server |
| Serial run | `jest --runInBand`, Vitest `--no-file-parallelism`, pytest without `-n` | Simplest fix when suites share one database |

Never rely on test execution order. Each test creates the data it needs.

## Mocking Strategy

Mock at architectural boundaries: persistence, external HTTP APIs, message brokers, clocks, ID and random generators.

### Fake repositories

Replace persistence with an in-memory implementation of the repository interface. Prefer a fake over a mock with stubbed calls.

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

A fake does not enforce database constraints. Cover unique constraints, foreign keys and transactions in integration tests.

### External HTTP

- Mock external clients at the adapter or port level (inject a fake `PaymentGateway`), not deep inside the HTTP library.
- When the transport itself is the subject, intercept at the network layer with the project's tool: msw or nock (Node), respx or responses (Python), `httptest.Server` (Go), WireMock (JVM).
- Recorded responses (VCR-style cassettes) suit providers that change rarely. Scrub authorization headers, API keys, cookies, tokens and personal data before committing a recording, and filter them in the recorder config so they are never written.
- Block real network calls in unit tests where the tool supports it (e.g. `nock.disableNetConnect()`), so a missing mock fails loudly instead of calling a live service.

### Time, IDs and randomness

Inject a clock and ID generator, or freeze time with the runner's tool.

```python
from datetime import datetime, timezone

class FixedClock:
    def now(self):
        return datetime(2025, 1, 1, tzinfo=timezone.utc)
```

- Node: `vi.useFakeTimers()` / `vi.setSystemTime(...)` (Vitest), `jest.useFakeTimers()` (Jest).
- Python: an injected clock, or freezegun / time-machine.
- Go and Java: pass a clock interface (`func() time.Time`, `java.time.Clock`).
- Use UTC in fixtures. Test time-zone and daylight-saving boundaries explicitly when the code handles local time.
- Seed random generators, or inject a deterministic one.

### What not to mock

- The unit under test.
- Value objects and pure functions.
- Every dependency by default. Prefer real collaborators inside the boundary and fakes at I/O boundaries.
- The ORM in an integration test. If an integration test only passes with the ORM mocked, it is not testing the integration.
