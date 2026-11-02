# Resilience Patterns

Patterns that stop one slow or failing dependency from taking the whole service down. Apply them to every synchronous remote call: HTTP and gRPC clients, databases, caches, brokers, and third-party SDKs.

Order of adoption: timeouts first, then safe retries, then circuit breakers and bulkheads, then load shedding. Each later pattern assumes the earlier ones are in place.

## 1. Timeouts and Deadline Propagation

Every remote call gets a timeout. No exceptions.

- Set both a connect timeout and an overall request timeout (connect + send + wait + read).
- The callee's timeout must be shorter than the caller's. A request handler with a 5 s budget cannot call a dependency with a 10 s timeout.
- Propagate the deadline, not a fixed timeout. Compute the remaining budget at each hop and pass it on:
  - Go: pass the request `context.Context` to every call; derive with `context.WithTimeout(ctx, d)`.
  - gRPC: deadlines propagate automatically when you pass the incoming context.
  - HTTP between your own services: send the remaining budget in a header your services agree on (for example `x-request-deadline` as an absolute UTC timestamp) and derive the downstream timeout from it.
- If the remaining budget is already spent, fail fast instead of starting the call.
- Database: set a pool acquire timeout and a statement timeout (Postgres `statement_timeout`, per role or per transaction with `SET LOCAL`).

Client defaults that are unsafe (verify against the library version in the lockfile):

| Client | Default | Fix |
|---|---|---|
| Node `fetch` (undici) | no overall request timeout | `fetch(url, { signal: AbortSignal.timeout(ms) })` |
| axios | `timeout: 0` (none) | `axios.create({ timeout: ms })` |
| Python `requests` | no timeout | always pass `timeout=(connect, read)` |
| Python `httpx` | 5 s | set explicitly per client so it is visible in review |
| Go `http.Client` / `http.DefaultClient` | `Timeout: 0` (none) | `&http.Client{Timeout: d}` plus a request context |
| Java `HttpClient` | no request timeout | `HttpRequest.newBuilder().timeout(d)` and `connectTimeout` |

Starting values for interactive request paths: connect 0.5 to 1 s, total 1 to 3 s per call, tuned from p99 latency of the dependency. Background jobs can use longer values, but never infinite.

## 2. Retries

Retry only when all of these hold:

1. The operation is idempotent or safe: GET, HEAD, PUT and DELETE with spec semantics, or a POST carrying an idempotency key (section 7).
2. The error is transient: connection refused or reset, timeout before a response, HTTP 429, 502, 503, 504, or a gRPC `UNAVAILABLE`. Never retry 400, 401, 403, 404, 409 or 422.
3. The retry budget allows it (below).

Backoff: exponential with full jitter.

```
sleep = random_between(0, min(cap, base * 2 ** attempt))
```

Typical values: `base` 100 ms, `cap` 2 to 5 s, at most 2 or 3 retries on a request path. Honor `Retry-After` when the server sends it, as a minimum delay. Stop when the deadline would be exceeded.

Retry budget: cap retries at a fraction of normal traffic per client, for example retries at most 10% of requests over a sliding window. When the budget is exhausted, fail without retrying. This prevents retry storms when a dependency is down.

Retry at one layer only. If the SDK, the service mesh and your code all retry 3 times, one failure becomes 27 calls. Pick the layer closest to the caller's intent and disable the others.

## 3. Circuit Breakers

A breaker stops calling a dependency that is failing, so callers fail fast instead of piling up on timeouts.

- **Closed**: calls pass; count failures and slow calls in a rolling window.
- **Open**: calls fail immediately (or go to the fallback) for a cool-down period.
- **Half-open**: allow a few trial calls; close on success, reopen on failure.

Rules:
- One breaker per dependency (or per dependency and endpoint group), never one global breaker.
- Trip on a failure rate over a minimum call count (for example 50% of at least 20 calls in 30 s), and count timeouts as failures.
- Export breaker state as a metric and alert when a breaker stays open.
- Do not wrap client errors (4xx) as breaker failures.

## 4. Bulkheads and Concurrency Limits

Isolate resources so one slow dependency cannot consume every thread, connection or event-loop slot.

- Give each dependency its own connection pool or a semaphore that limits in-flight calls.
- Size DB pools from the database's limit, not the app's wishes: `instances x pool_size` must stay below the server's `max_connections` minus admin headroom. Use a pooler (PgBouncer or the provider's proxy) when instances scale out.
- When the bulkhead is full, reject immediately or wait with a short timeout. Never queue without a bound.

## 5. Load Shedding

When the service is past capacity, reject some work early so the rest succeeds.

- Limit concurrent in-flight requests per instance. Over the limit, return 503 (or 429 for per-client quotas) with `Retry-After`.
- Drop requests that waited in a queue longer than their deadline; the caller has already given up.
- Shed low-priority traffic first (batch, analytics, health of non-critical features) and keep critical paths (login, checkout) serving.
- Adaptive limiters (gradient or AIMD style) adjust the limit from observed latency; use one if the framework offers it.

## 6. Fallbacks

A fallback returns a degraded but acceptable answer when the dependency is unavailable:

- serve stale cached data with a staleness marker;
- return a default (empty recommendations, feature hidden);
- queue the work for later and return 202.

Never fall back on correctness-critical paths: authentication, authorization, payments, balances and inventory must fail closed. Log and count every fallback so degraded operation is visible.

## 7. Idempotency Keys

Make non-idempotent writes safe to retry.

1. The client sends `Idempotency-Key: <uuid>` on POST requests that create or charge something.
2. The server stores the key with a hash of the request body, the response status and body, and a status (`in_progress`, `completed`), under a unique constraint scoped to the caller (tenant or user plus key).
3. On a repeat with the same key and same body hash, return the stored response. Same key with a different body: 422. Same key still `in_progress`: 409.
4. Expire keys after a window that covers client retries (commonly 24 h).

Insert the key row in the same transaction as the business write, or before it with a unique constraint, so two concurrent retries cannot both execute.

## 8. Outbox for Reliable Publish

When a DB write and an event publish must both happen, write the event to an outbox table in the same transaction and publish it from a relay. Details, relay concurrency and consumer dedup are in `messaging.md` -> Outbox Pattern.

## Libraries (verify the current release before adding)

| Stack | Options |
|---|---|
| Node.js | `cockatiel` (retry, breaker, bulkhead, timeout), `opossum` (breaker), `p-limit` (concurrency) |
| Python | `tenacity` (retry), `purgatory` or `pybreaker` (breaker), `asyncio.Semaphore` (bulkhead) |
| Go | `context` deadlines, `failsafe-go` or `sony/gobreaker`, `golang.org/x/sync/semaphore` |
| Java / Kotlin | Resilience4j (Spring Cloud Circuit Breaker integrates it) |
| .NET | Polly / `Microsoft.Extensions.Http.Resilience` |

Adding any of these is a dependency install: Always Ask First (see `<shared>/tool-rules.md`).

## Verification

- Unit test the policy: a fake dependency that hangs must produce a timeout error within the budget; a non-idempotent call must not be retried.
- Fault injection in local integration tests: Toxiproxy or a stub server that adds latency, resets connections and returns 503. Confirm the breaker opens, the fallback serves, and latency stays bounded.
- Metrics to add: per-dependency latency and error rate, retry count, breaker state, rejected (shed) requests, pool wait time.
