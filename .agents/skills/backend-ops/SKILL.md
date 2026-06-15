---
name: backend-ops
description: "Own observability, caching, async messaging, and config management for backend projects. Use this skill when the user says 'observability', 'logging', 'metrics', 'tracing', 'caching', 'queue', 'config', 'async', 'production-ready', or asks how to operate a backend at scale."
---

# Backend Ops

## When to Activate

- User asks about observability, logging, metrics, tracing, or monitoring
- User says "caching strategy", "cache invalidation", "prevent cache stampede"
- User asks about queues, async processing, message brokers, retries, dead-letter
- User says "config management", "feature flags", "secrets injection", "environment variables"
- User wants to make a backend production-ready
- Before defining SLIs/SLOs or incident-response runbooks

## Context Loading

Read project memory for existing stack before recommending tools:

- `.opencode/everything-backend-memory/project-overview.md` — architecture shape
- `.opencode/everything-backend-memory/tech-stack.md` — language/framework/database
- `.opencode/everything-backend-memory/decisions.md` — prior operational choices
- `.opencode/everything-backend-memory/api-patterns.md` — endpoint hot paths to instrument

If memory is stale or empty, suggest running `backend-scan` first.

## Operational Principles

Apply the system and security principles in `_shared/principles.md` to operational design.

## Logging

### Structured Logs

- Emit JSON or key-value logs with consistent fields: `timestamp`, `level`, `service`, `correlation_id`, `message`, `error`
- Avoid string concatenation; use structured context instead

```json
{
  "timestamp": "2026-06-15T12:34:56Z",
  "level": "error",
  "service": "payment-service",
  "correlation_id": "abc-123",
  "message": "charge failed",
  "error": "insufficient_funds",
  "user_id": "redacted"
}
```

### Log Levels

| Level | Use |
|-------|-----|
| `DEBUG` | Detailed dev/troubleshooting info |
| `INFO` | Normal business events |
| `WARN` | Degraded state, recoverable issues |
| `ERROR` | Failures needing investigation |
| `FATAL` | Crash the process, alert immediately |

- `INFO` in production should be meaningful, not noisy
- Use sampling or dynamic log levels for high-volume debug logs

### Correlation IDs

- Generate a `correlation_id` (or `trace_id`) at the edge and propagate through headers and logs
- Include it in every downstream call and log entry
- Return it in error responses so users can reference incidents

### PII Redaction

- Build a deny-list of sensitive fields: `password`, `token`, `ssn`, `email`, `phone`, `credit_card`
- Redact automatically in log serializers and error responses
- Log only hashes or masked values for identifiers when needed

## Metrics

### What to Measure

- **Request rate, latency (p50/p95/p99), errors** per endpoint
- **Business outcomes**: orders created, payments succeeded, jobs completed
- **Resource health**: CPU, memory, DB connections, queue depth, disk
- **Dependency health**: external API latency/error rate

### Metric Types

| Type | Use |
|------|-----|
| Counter | Events, successes, failures |
| Histogram / Summary | Latency distributions |
| Gauge | Current state (queue depth, active connections) |

### Health Metrics

- Expose `/health`, `/ready`, and `/metrics` endpoints
- Liveness: process is running
- Readiness: dependencies (DB, cache, queue) are reachable
- Metrics endpoint should be scrapable by Prometheus-compatible collectors

## Tracing

### Distributed Tracing Basics

- A trace follows a request across services; spans represent operations within that trace
- Start a root span at the edge and propagate context in headers (`traceparent`)
- Add spans for DB queries, cache calls, external HTTP requests, and queue publishes/consumes

### OpenTelemetry

- Prefer OpenTelemetry for vendor-neutral instrumentation
- Auto-instrument HTTP frameworks, databases, and message brokers when available
- Export to OTLP, Jaeger, Zipkin, or vendor backends
- Keep span names stable and use attributes for variable data

```
span name: GET /api/v1/orders/:id
attributes:
  http.method: GET
  http.route: /api/v1/orders/:id
  http.status_code: 200
  db.statement: SELECT * FROM orders WHERE id = ?
```

## Caching

### Cache Layers

| Layer | Use |
|-------|-----|
| In-process (LRU) | Hot local objects, tiny data, no eviction control |
| Distributed (Redis/etc.) | Shared state across instances, explicit TTL |
| CDN | Static assets, public GET responses |
| HTTP cache headers | Browser/proxy caching for idempotent reads |

### Cache Key Design

- Include version, resource type, and deterministic parameters
- Avoid unbounded key cardinality
- Use prefixes to enable bulk invalidation: `v1:users:{id}`, `v1:orders:list:{query_hash}`

### Invalidation Strategies

- **TTL**: simple, acceptable staleness
- **Write-through**: update cache on write, always consistent but slower
- **Write-behind**: write to cache, flush async to DB; risky
- **Cache-aside**: app manages cache; common, flexible, requires explicit invalidation
- **Event-based invalidation**: subscribe to change events and evict/update keys

### Stampede Protection

- Use locks or single-flight patterns so only one process repopulates a missing key
- Add a short jitter to TTLs to avoid mass expiration
- Serve stale-while-revalidate for reads when acceptable

## Async / Messaging

### Job Queues vs Message Brokers

| Pattern | Use |
|---------|-----|
| Job queue | Delayed work, retries, rate limiting, background tasks |
| Pub/sub | Broadcast events, decoupled consumers |
| Stream | Event sourcing, ordered event log, replay |

### Message Handling Rules

1. **Idempotency**: consumers must handle duplicate messages safely
2. **Ack only after success**: only acknowledge after processing and persistence
3. **Bounded retries**: cap retries with exponential backoff and jitter
4. **Dead-letter queue**: route permanently failed messages for inspection
5. **Visibility timeout**: prevent double-processing in pull-based queues

### Outbox Pattern

- Use when a transaction must publish an event atomically with a DB write
- Write the event to an `outbox` table in the same transaction
- A relay process polls the outbox and publishes to the broker
- Mark events as processed after successful publish

### Retries and Dead-Letter

```
retry_policy:
  max_attempts: 5
  backoff: exponential
  initial_delay: 1s
  max_delay: 60s
  jitter: true

on_permanent_failure:
  move_to: dlq
  alert: true
  manual_review: true
```

## Config Management

### Environment Validation

- Load config at startup and fail fast on missing required values
- Validate types, ranges, and allowed values
- Separate defaults (safe for dev) from required secrets

### Feature Flags

- Use feature flags for rollout, kill switches, and A/B behavior
- Store flag state outside the deploy pipeline when possible
- Audit flag changes and provide an emergency off switch

### Secrets Injection

- Never commit secrets; load from environment variables, secret managers, or mounted files
- Rotate secrets regularly and support zero-downtime rotation
- Do not print secrets in logs, error messages, or health endpoints

### Multi-Environment Config

- Keep environment-specific values in environment variables or environment-specific config files
- Use the same artifact/container across environments; only config changes
- Document required variables with examples in a non-secret template

## Decision Trees

### Choosing a Cache Strategy

```
Read-heavy, low mutation, tolerant of staleness?
  YES -> Cache-aside with TTL
  NO -> Write-through or event invalidation

Need shared state across instances?
  YES -> Distributed cache
  NO -> In-process LRU may suffice

Frequently requested key with expensive computation?
  YES -> Add stampede protection (single-flight/lock)
  NO -> TTL is usually enough
```

### Choosing a Queue Type

```
Single producer, single consumer, retries needed?
  -> Job queue (Redis/Bull, Celery, Sidekiq, etc.)

Multiple consumers, fan-out, no ordering?
  -> Pub/sub topic

Ordered events, replay, audit log?
  -> Stream/Kafka-style log

Must guarantee publish after DB write?
  -> Outbox pattern + any broker
```

### Choosing an Observability Stack

```
Single service, simple needs?
  -> Structured logs + basic metrics endpoint

Multiple services, cross-request debugging?
  -> Add OpenTelemetry tracing

SLI/SLO dashboards and alerting?
  -> Metrics backend (Prometheus-compatible) + alerting rules

Security/compliance audit trail?
  -> Immutable audit log + long-term storage
```

## Execution Process

1. **Load context**: read memory files or run `backend-scan`
2. **Identify concern**: logging, metrics, tracing, caching, async, or config
3. **Apply principles**: enforce the rules in this skill
4. **Recommend concrete patterns**: use decision trees to narrow options
5. **Draft changes**: propose config, code snippets, or runbook steps aligned with the existing stack
6. **Confirm scope**: ask the user whether to implement now or produce a design doc
