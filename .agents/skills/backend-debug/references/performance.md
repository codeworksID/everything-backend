# Performance Debugging

Use this when the bug is "slow": a latency or throughput regression, high CPU, growing memory, or too many queries. The loop is the same as any bug: measure, reproduce, capture in a test, find the cause, fix, measure again.

## Contents

- Measure first
- Reproduce locally
- Database: EXPLAIN and EXPLAIN ANALYZE
- N+1 detection
- Profilers per stack
- Load generation
- Regression tests for performance
- Common fixes and handoffs

## Measure First

1. Define the metric and the number: "p95 of `GET /orders` went from 120 ms to 900 ms after release X". Without a baseline, measure one before changing anything.
2. Find where the time goes before guessing: tracing spans, request timing logs, database slow-query logs, APM data the user can share.
3. Split the time into: database, outbound calls, CPU in the process, waiting (pool, locks, queue).

Done when you know which component holds most of the time.

## Reproduce Locally

- Use a local database with enough synthetic data to show the problem. A query that is fast on 100 rows may be slow on 1 million; generate data with the same distribution (row counts, skew, nulls), never a copy of production PII.
- Run the slow request or function in a loop and record timings (median and p95 over at least 20 runs) before and after the fix.
- Keep everything local per `<shared>/tool-rules.md` -> Production Targets.

## Database: EXPLAIN and EXPLAIN ANALYZE

- `EXPLAIN` shows the plan without running the query. Safe to run on a local database.
- `EXPLAIN ANALYZE` **executes the query**. On `INSERT`, `UPDATE` or `DELETE` it changes data, and on a large `SELECT` it adds real load. Rules:
  - A `SELECT` runs without asking only on a provably local database (`<shared>/tool-rules.md` -> Production Targets).
  - A data-changing statement is DML: it runs without asking only on a disposable database this run started (Testcontainers, temp SQLite); on any other database, including the user's local dev database, ask first. Always wrap it: `BEGIN; EXPLAIN ANALYZE <statement>; ROLLBACK;`. Triggers and sequences still fire, and sequence values are not rolled back.
  - On a shared, staging or production database it is Always Ask First, even for a `SELECT`. Prefer the plan from logs the user already has (for PostgreSQL, `auto_explain` or `pg_stat_statements`) over running it there.
- PostgreSQL: `EXPLAIN (ANALYZE, BUFFERS)`. Look for sequential scans on large tables, row estimates far off actual rows (stale statistics; `ANALYZE` the table locally), nested loops over many rows, sorts or hashes spilling to disk, and high buffer reads. See `<shared>/stacks/postgres.md` -> Query Diagnosis and Indexing.
- MySQL: `EXPLAIN` and `EXPLAIN ANALYZE` (also executes). Look for `type: ALL`, `Using filesort`, `Using temporary`.
- MongoDB: `.explain("executionStats")` executes the query; check `COLLSCAN` and `totalDocsExamined` vs `nReturned`.
- Get the SQL the ORM actually sends (see query logging below) before explaining it. Do not explain a query you rewrote by hand.

## N+1 Detection

Symptom: query count grows with the number of rows returned (1 query for the list, plus 1 per item).

Turn on query logging locally and count queries for one request:

| Stack | How to see queries |
|---|---|
| Prisma | `new PrismaClient({ log: ['query'] })` |
| TypeORM | `logging: ['query']` in the data source options |
| Sequelize | `logging: console.log` |
| Drizzle | `drizzle(client, { logger: true })` |
| Knex | `DEBUG=knex:query` |
| SQLAlchemy | `create_engine(..., echo=True)` |
| Django | `django.test.utils.CaptureQueriesContext` or `assertNumQueries` in tests |
| ActiveRecord | the development log, or `ActiveSupport::Notifications` `sql.active_record` |
| GORM | `db.Debug()` |
| Hibernate / JPA | `spring.jpa.show-sql=true` or Hibernate statistics |
| EF Core | `LogTo(Console.WriteLine)` |

Fix with the ORM's eager loading or batching (`include`, `relations`, `selectinload`/`joinedload`, `select_related`/`prefetch_related`, `includes`, `Preload`, `JOIN FETCH`, `Include`), or a dataloader for GraphQL resolvers. Watch for the opposite problem: one huge join that returns duplicated rows.

## Profilers per Stack

Run profilers on a local process. Installing a profiler that is not already in the project is a dependency install: Always Ask First. Built-in options need no install.

| Stack | CPU | Memory |
|---|---|---|
| Node.js | `node --cpu-prof` (writes a `.cpuprofile` for Chrome DevTools), `node --inspect` with DevTools, `--prof` + `--prof-process` | `node --heapsnapshot-signal=SIGUSR2` (not on Windows), `v8.writeHeapSnapshot()`, or DevTools heap snapshots; `--inspect` allocation timeline |
| Python | `python -m cProfile -o out.prof` (built in), `py-spy` (install) for a running process | `tracemalloc` (built in), `memray` (install) |
| Go | `net/http/pprof` or `go test -cpuprofile`, then `go tool pprof` | `go tool pprof` heap profile; `go test -race` for races |
| Java / JVM | Java Flight Recorder (`jcmd <pid> JFR.start`), async-profiler (install) | JFR, heap dump via `jcmd <pid> GC.heap_dump` |
| .NET | `dotnet-trace` (install as a tool) | `dotnet-gcdump`, `dotnet-counters` |

Read the profile top-down: the widest frames in project code are the target. Framework and runtime frames point at how the code uses them (serialization, regex, crypto, logging volume).

Heap dumps and profiles can contain secrets and PII from memory. Keep them out of the repository and memory files, and delete them when done.

## Load Generation

- Use a tool already available in the project or ask before installing one (autocannon, k6, hey, wrk, locust).
- Point load only at a local process. Load against a shared or production environment is Always Ask First: it can cause an outage and cost money.
- Keep runs short and within Command Time Budgets. Compare the same scenario before and after.

## Regression Tests for Performance

Wall-clock assertions are flaky. Prefer deterministic proxies:

- Query count: assert the number of queries for a request is constant as rows grow (e.g. `assertNumQueries`, or count logged queries in a test helper).
- Plan shape: assert an index is used, for critical queries, with an integration test on a local database.
- Complexity: assert the number of calls to a dependency (fake repository counters).
- If a timing assertion is unavoidable, use a generous bound and mark it as a performance test that runs separately, following `test-strategy.md`.

## Common Fixes and Handoffs

| Cause | Fix | Owner |
|---|---|---|
| N+1 queries | Eager load or batch | this skill |
| Missing or wrong index | New index (built `CONCURRENTLY` on PostgreSQL) | `backend-migrate` |
| Unbounded result set | Pagination, `LIMIT`, streaming | this skill; contract changes via `backend-api-design` |
| Repeated expensive reads | Caching with invalidation | `backend-ops` |
| Pool exhaustion | Release connections on error paths here; pool sizing in `backend-ops` | both |
| Slow outbound dependency | Timeout here; circuit breaker, bulkhead, retry policy in `backend-ops` | both |
| CPU-heavy work on the request path | Move to a background job or worker | `backend-ops` for the queue, this skill for the code |
| Event-loop blocking | Async APIs, worker threads, chunking | this skill |

Report the before and after numbers from the same local scenario. Do not claim a production improvement you have not measured there.
