# Triage Playbook

Symptom-first checks for Step 4 (find the root cause). Each section lists what to collect, where the cause usually is, how to capture it in a test, and the typical fix. Always confirm a cause with evidence before fixing.

## Contents

- General techniques: temporary logging, git history and bisect, narrowing
- 500 errors and unhandled exceptions
- Timeouts and hangs
- Wrong data
- Flaky tests
- Memory leaks
- Deadlocks and lock waits
- Race conditions
- SQL/NoSQL injection and BOLA (another tenant's or user's row)
- Works locally, fails in CI or another environment

## General Techniques

### Temporary logging

- Tag every temporary line with one marker so removal is mechanical, e.g. a comment or message containing `DEBUG-backend-debug`. Search for the marker in Step 6 and confirm zero hits.
- Record each file you add logging to in the checkpoint (`checkpoint.js record --modified`).
- Log shapes, not values: types, lengths, keys, ids, counts, timing. Never log passwords, tokens, API keys, session cookies, full request bodies with PII, or connection strings.
- Prefer the project logger at debug level over `print`/`console.log` when the project has one, so the output carries the request id.
- Do not add temporary logging to code that runs in production. Diagnostic logging for a production issue is a separate change the user approves and deploys.

### Git history

- Read-only, runs without asking: `git log --oneline -- <file>`, `git log -p -S "<string>"` (when a string appeared or vanished), `git blame -L <start>,<end> <file>`, `git show <sha>`, `git diff <good>..<bad> -- <path>`.
- `git bisect` moves `HEAD` and writes refs under `refs/bisect/`: Always Ask First. Before asking, confirm the tree is clean (`git status --porcelain`) and that you have a known good and a known bad commit.
- Automated bisect: `git bisect start <bad> <good>` then `git bisect run <command>`. The command must exit 0 for good, 1-124 or 126-127 for bad, and 125 to skip an untestable commit. Use the failing test from Step 3 as the command when it runs on old commits; otherwise a small script.
- The bisect command runs on every tested commit, so it must also pass the Target Check (local targets only) and must not migrate a shared database.
- Always finish with `git bisect reset` and confirm `HEAD` is back on the starting branch.

### Narrowing

- Halve the input: shrink the failing payload or dataset until removing anything makes the bug disappear.
- Halve the path: assert or log at the midpoint of the call chain, then move toward the fault.
- Compare a working and a failing case side by side (same endpoint, different tenant, input or version) and list every difference.
- Check recent changes in dependencies: the lockfile diff between the good and bad versions.

## 500 Errors and Unhandled Exceptions

Collect: the full stack trace, the request (method, path, body shape, headers that matter), the request id, and the error-handler output.

Common causes:
- Null or missing value from a lookup the code assumed would succeed (deleted row, optional relation, empty config).
- Unvalidated input reaching the service: wrong type, out-of-range value, unexpected enum.
- A domain error with no mapping in the error handler, so it falls through to 500 instead of 400, 404 or 409.
- Constraint violation from the database (unique, foreign key, not null) surfacing as a raw driver error.
- Unhandled promise rejection or missing `await` (Node), exception in a background task (Python), nil pointer or ignored `err` (Go).
- Serialization failure: circular reference, `Decimal`/`BigInt`/datetime not serializable.

Test: a contract or integration test that sends the failing request and asserts the correct status and error body.

Fix: validate at the boundary, map the domain error to its status, or handle the absent case explicitly. Do not catch-all and return 200.

## Timeouts and Hangs

Collect: which call is slow (trace spans, timing logs), whether it always or sometimes times out, current pool usage.

Common causes:
- Connection pool exhaustion: a connection or transaction not released on an error path, or a long transaction holding connections.
- Missing timeout on an outbound HTTP call or queue operation, so one slow dependency blocks workers.
- Lock waits in the database (see Deadlocks).
- Event-loop blocking in Node (synchronous crypto, large `JSON.parse`, CPU loops) or a blocking call inside an async function in Python.
- Unbounded query (no `LIMIT`, missing index) on a grown table: see `performance.md`.
- Retry storms: retries without backoff on a dependency that is already slow.

Test: a test with a fake dependency that never responds, asserting the call fails within the configured timeout and releases its connection.

Fix: release resources in `finally`/context managers, set explicit timeouts, move blocking work off the event loop. Pool sizing, circuit breakers and retry policy go to `backend-ops`.

## Wrong Data

Collect: an example of the wrong output, the expected output, and the stored rows that produced it (synthetic copies, never production PII).

Common causes:
- Missing tenant or ownership filter in a query. This is a security bug (BOLA), not only wrong data: follow the "SQL/NoSQL Injection and BOLA" section below.
- Time zones: local time stored as UTC or the reverse, date boundaries computed in the server's zone, DST.
- Number handling: floats for money, integer overflow, rounding at the wrong step, string vs number comparisons.
- Encoding and casing: Unicode normalization, case-sensitive lookups, trimming.
- Stale cache returning old values after a write; cache key missing a dimension (tenant, locale, version).
- Mapping errors between layers: a field renamed in one DTO, a default applied twice, `0`/`false`/empty string treated as missing.
- Ordering assumed but not specified (`SELECT` without `ORDER BY`).

Test: a unit or integration test with the minimal data set that yields the wrong value, asserting the correct one.

Fix: correct the logic at the source. If existing stored data is already wrong, a data correction is a separate, approved operation (a migration or script through `backend-migrate`), never an ad-hoc `UPDATE`.

## Flaky Tests

Collect: failure rate over repeated runs (run the single test 20-50 times locally, within the time budget), the failing assertion, and whether order or parallelism matters (run in isolation, then with the full suite, then in random order if the runner supports it).

Common causes:
- Shared mutable state: module-level variables, singletons, a database not cleaned between tests, test order dependence.
- Time: `now()` near a boundary (midnight, month end, DST), timeouts too tight for CI.
- Unordered results compared as ordered (sets, `SELECT` without `ORDER BY`, object key order, parallel promises).
- Real network, real clock or random ids without seeds.
- Async work not awaited before the assertion; fixed `sleep` instead of waiting for a condition.
- Port or file collisions under parallel runs.

Test: the flaky test itself is the test. Make the failure deterministic first (freeze time, fix the seed, force the order) so you can see it fail on demand.

Fix: isolate state, inject a clock, sort before comparing, await the real completion signal. Test Integrity applies: never add retries, skip, or loosen the assertion to hide flakiness. If the flake is a real race in the code, see Race Conditions.

## Memory Leaks

Collect: memory over time (container metrics, RSS), the workload that grows it, and whether it drops after load stops.

Common causes:
- Unbounded in-process caches or maps keyed by user, request or id.
- Event listeners, intervals or subscriptions added per request and never removed.
- Closures holding large objects (request bodies, result sets) in long-lived scopes.
- Loading a whole table or file into memory instead of streaming.
- Python: module-level lists or dicts that only grow. Go: goroutines blocked forever on channels or never cancelled via context.

Diagnose with heap snapshots or allocation profiles (tools per stack in `performance.md`). Take two snapshots under the same load and compare what grew.

Test: where practical, a test that runs the operation many times and asserts a bounded size (cache size, listener count, goroutine count) rather than raw memory.

Fix: bound caches (size and TTL), remove listeners in cleanup, stream large data.

## Deadlocks and Lock Waits

Collect: the database deadlock log or error (e.g. PostgreSQL `deadlock detected` with the two statements), lock wait timeouts, and which transactions ran concurrently.

Common causes:
- Two code paths updating the same rows in different orders.
- Long transactions that include network calls or user waits.
- Missing index on a foreign key, so updates lock more rows than needed.
- `SELECT ... FOR UPDATE` taken late after reads, or lock escalation in some engines.
- In-process deadlocks: two mutexes acquired in different orders, or an async lock awaited while held.

Inspect live locks only on a local database (for PostgreSQL see `<shared>/stacks/postgres.md` -> Query Diagnosis). Querying lock views on a shared or production database is Always Ask First.

Test: an integration test that runs the two operations concurrently against a local database and asserts both complete.

Fix: acquire locks in a consistent order, shorten transactions, move external calls out of transactions, add the missing index (through `backend-migrate`). A bounded retry on serialization or deadlock errors is acceptable only in addition to fixing the order.

## Race Conditions

Collect: the interleaving that fails (two requests, a job and a request, retries), and whether it shows under load or parallel tests.

Common causes:
- Check-then-act: read a value, decide, then write, with no lock or constraint (double booking, duplicate signup, overdraft).
- Read-modify-write on counters or balances without an atomic update.
- Non-idempotent handlers for retried requests or redelivered messages.
- Cache invalidation racing with a write.
- Shared state in a worker or between goroutines/threads without synchronization.

Test: run the two operations concurrently in a loop (e.g. `Promise.all`, `asyncio.gather`, goroutines with `-race` in Go) against a local database, and assert the invariant holds.

Fix: enforce the invariant in the database (unique constraint, conditional update `UPDATE ... WHERE balance >= :amount`, optimistic version column) or with an explicit lock; make handlers idempotent with a key. Schema constraints go through `backend-migrate`.

## SQL/NoSQL Injection and BOLA

`<shared>/sql-safety.md` is the rule set for this section; read it fully before fixing. This section only adds the debug loop.

Signals that point here:
- A 500 with a raw driver error (`syntax error at or near`, `unterminated quoted string`, `You have an error in your SQL syntax`) when the input contains `'`, `\`, `;` or `--`.
- A search, filter or sort parameter that changes the result in ways the code should not allow: extra rows, a different column order, a slow response for a crafted value.
- A name like `O'Brien` that fails to save or find.
- A login or lookup that succeeds with a JSON object where a string was expected (`{"$ne": null}`).
- A user or tenant who can read, change or delete a row they do not own by changing an id in the path, query or body.

Collect: the endpoint, the parameter, the payload that shows the bug, and the query the code actually sends (query logging, see `performance.md` -> N+1 Detection). Then read the repository/DAO code that builds it. Look for the unsafe patterns in `_shared/sql-safety.md` -> Safe vs Unsafe APIs per Stack, for a client value used as a column, table or sort name, and for a WHERE clause on `id` with no owner predicate.

Reproduce locally only (Production Targets apply). Never send hostile payloads to a shared, staging or production environment: that is an attack on a live system, and it is Always Ask First even when the user owns it. Use the full hostile payload list in `_shared/sql-safety.md` -> Verification, step 4 (value, sort/field, JSON operator and other-owner cases). For ownership, authenticate as user or tenant A and request B's id.

Test: write these as the failing tests in Step 3, at the integration or contract level against a local database (follow `backend-test` -> security tests). Each asserts a 400, or an empty or own-tenant result, and never extra rows, a 500, a leaked SQL error, or a changed row count. For BOLA, assert 404 (or 403, per the project's convention) for the other owner's id on every verb the endpoint supports (GET, PUT/PATCH, DELETE), and that the other owner's row is unchanged.

Fix, by cause:
- Value concatenated into SQL: bind it as a parameter with the safe API for the stack. Do not "escape" or strip quotes by hand.
- Client value used as an identifier (sort, column, table, direction): map it through a server-side allowlist and reject anything else with 400.
- `IN` list built with `join`: use array binding (`= ANY($1)`, expanding bindparams, `sqlx.In`) with a length cap.
- LIKE search: escape `\`, `%`, `_` in the value, bind it, and add `ESCAPE '\'`.
- ORM raw/unsafe API with input: switch to the safe variant.
- Dynamic SQL in a stored procedure: `format('%I')` for identifiers and `USING` for values.
- NoSQL operator injection: reject non-scalar values where a scalar is expected and keys starting with `$`; enable the driver's sanitize option.
- Missing owner predicate (BOLA): add `AND tenant_id = $n` (or `owner_id`) bound from the authenticated principal, never from the request, on every read and every UPDATE/DELETE for that resource.
- Driver error returned to the client: map it to a generic error and log details server-side without values.

Input validation is defense in depth, not the fix: a schema that rejects `'` does not make string-built SQL safe.

Then search the codebase for the same pattern (Step 5). Every other occurrence reachable from an endpoint is the same class of bug: fix the ones in the same flow, log the rest in `issues.md` with severity per `_shared/sql-safety.md` -> Verification, step 5 (Critical if reachable from a public or low-privilege endpoint, High otherwise), and suggest `backend-security` for a wider review. Before reporting done, run the full Verification list in `_shared/sql-safety.md` on every changed file.

## Works Locally, Fails Elsewhere

Collect: the exact difference in environment: runtime version, dependency lockfile, env vars (names only), OS and file system, time zone, locale, CPU count, database version.

Common causes: missing env var with a silent default, case-sensitive paths on Linux, different time zone or locale, lockfile not used in CI (`npm install` vs `npm ci`), service start order, a database version without a feature.

Fix the code or the local reproduction so both environments behave the same. Editing CI configuration is Always Ask First.
