# Observability

Logs, metrics, traces, health endpoints, SLOs, alerting and incident response. Per-stack code is in `scaffolding.md`.

## Logging

### Structured Logs

Emit JSON (or key-value) with consistent fields: `timestamp` (UTC, ISO 8601), `level`, `service`, `correlation_id`, `message`, and `error` with type and stack on failures. Put variable data in fields, not in the message string.

```json
{
  "timestamp": "2026-06-15T12:34:56Z",
  "level": "error",
  "service": "payment-service",
  "correlation_id": "abc-123",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "message": "charge failed",
  "error": { "type": "CardDeclined", "code": "insufficient_funds" },
  "user_id_hash": "9f2c..."
}
```

### Log Levels

| Level | Use |
|---|---|
| DEBUG | detailed troubleshooting; off in production by default |
| INFO | meaningful business and lifecycle events |
| WARN | degraded but recovered (fallback served, retry succeeded) |
| ERROR | a request or job failed and needs attention |
| FATAL | the process cannot continue; log and exit |

- Keep INFO in production meaningful, not one line per function call.
- Sample high-volume DEBUG logs, or allow changing the level at runtime.
- Log each error once, where it is handled, not at every layer it passes through.

### Correlation IDs

- Accept an inbound `X-Correlation-ID` (or `X-Request-ID`) only if it matches a strict pattern such as `^[A-Za-z0-9._-]{1,128}$`; otherwise generate a new UUID. Unvalidated IDs allow log injection.
- Bind the ID to the request's logger context so every log line carries it.
- Send it on every outbound call and message, and return it as a response header on every response, including errors. The API error body may also include it as `request_id`.
- When OpenTelemetry tracing is on, also log `trace_id` and `span_id`; the W3C `traceparent` header carries trace context between services.

### PII and Secret Redaction

- Configure redaction in the logger itself (serializer or processor), not by convention at call sites.
- Deny-list at least: `password`, `token`, `authorization`, `cookie`, `set-cookie`, `secret`, `api_key`, `ssn`, `credit_card`, `card_number`, and per project, `email` and `phone`.
- Log stable hashes or masked forms of identifiers when you need to correlate users.
- Never log full request or response bodies on authenticated routes by default.

## Metrics

### What to Measure

- **RED per endpoint**: request rate, errors, duration (p50, p95, p99 from histograms).
- **USE per resource**: utilization, saturation, errors for CPU, memory, DB pool, queue depth, disk.
- **Dependencies**: latency and error rate per downstream, breaker state, retries (see `resilience.md`).
- **Business outcomes**: orders created, payments succeeded, jobs completed.

### Types

| Type | Use |
|---|---|
| Counter | events, successes, failures (monotonic) |
| Histogram | latency and size distributions; aggregatable across instances |
| Gauge | current state: queue depth, in-flight requests, pool usage |

Prefer histograms over summaries: summary quantiles cannot be aggregated across instances.

### Cardinality

- Label HTTP metrics with the route template (`/orders/:id`), method and status class. Never label with raw paths, user ids, emails, request ids or other unbounded values.
- Keep each metric's label combinations small (hundreds, not millions). Unbounded labels exhaust the metrics backend.

### Exposing `/metrics`

- Serve the scrape endpoint on a separate internal port (for example `METRICS_PORT=9464`) that is not routed through the public load balancer or ingress. If it must share the main port, block it at the ingress and require network-level restriction.
- Never put secrets, config values or per-user data in metric labels.

## Tracing

- Use OpenTelemetry for vendor-neutral instrumentation. Export with OTLP (gRPC on 4317 or HTTP on 4318) to a Collector or a backend that accepts OTLP. Jaeger and most vendors ingest OTLP directly; the dedicated Jaeger exporters are deprecated.
- Configure with standard environment variables: `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_RESOURCE_ATTRIBUTES` (for example `deployment.environment.name=prod,service.version=1.4.2`), `OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG`.
- Auto-instrument the HTTP framework, HTTP clients, DB drivers and broker clients; add manual spans only for meaningful business steps.
- Span names are low-cardinality: `GET /api/v1/orders/:id`, not the raw URL.
- Use current semantic conventions. Stable HTTP attributes: `http.request.method`, `http.route`, `http.response.status_code`, `url.path`, `server.address`. Database: `db.system.name` (older SDKs emit `db.system`), `db.query.text`. Older SDKs emit `http.method`, `http.status_code` and `db.statement`; match the SDK version in the lockfile and the queries your dashboards use.
- Record query text only in parameterized form (placeholders, no literal values). Never put PII or secrets in span attributes.
- Sampling: `parentbased_traceidratio` with a ratio such as 0.05 to 0.2 for busy services keeps volume bounded and respects upstream decisions. Tail sampling in the Collector can keep all error and slow traces.

## Health Endpoints

- Detect existing health routes first (search for `health`, `healthz`, `livez`, `ready`, `readyz`, `health/live`, `health/ready`) and in deploy configs (Kubernetes probes, compose `healthcheck`, load balancer settings). Reuse what exists.
- For a service with none, use the paths in the matching `<shared>/stacks/` file (`/healthz` for liveness, `/readyz` for readiness) unless `deployment.md` memory or the deploy config names others. Record the choice in `decisions.md` so `backend-deploy` and `backend-doctor` use the same paths.
- Liveness: the process can serve; no dependency checks (a DB blip must not restart every pod).
- Readiness: returns 503 while starting or shutting down, and checks hard dependencies with a short timeout (1 to 2 s each) and a cached result if checks are expensive.
- Responses are minimal (`{"status":"ok"}` or `{"status":"unavailable"}`). Never return versions of internal components, hostnames, connection strings or error details.

## SLOs and Alerting

1. Pick SLIs from what users feel: availability (share of non-5xx responses), latency (share of requests under a threshold), freshness for async pipelines.
2. Set an SLO per SLI and window, for example 99.9% of requests succeed over 30 days. The error budget is the remaining 0.1%.
3. Alert on error-budget burn rate, not on raw thresholds. A common multiwindow setup for a 30-day SLO:
   - page: burn rate 14.4 over 1 h and 5 min (2% of the budget spent in an hour);
   - page: burn rate 6 over 6 h and 30 min;
   - ticket: burn rate 1 over 3 days and 6 h.
4. Every alert links to a runbook in `docs/runbooks/<alert-or-topic>.md` that says what the alert means, how to check impact, and the first mitigation steps.
5. Also alert on: saturation (pool exhaustion, disk), DLQ growth, oldest-message age, backup and WAL-archive failures (see `backup-dr.md`).
6. Delete alerts nobody acts on.

## Incident Response

Runbook skeleton for `docs/runbooks/incident-response.md`:

1. **Detect and declare**: who can declare, severity levels, where the incident channel is.
2. **Roles**: incident lead, communications, operations.
3. **Triage**: user impact, start time, recent changes (deploys, flags, config, migrations).
4. **Mitigate first**: roll back the last deploy, turn off the flag, shed load, fail over. Restore service before finding the root cause. Production actions are Always Ask First for the agent.
5. **Timeline**: record every action with a UTC timestamp as it happens.
6. **Resolve and verify**: SLIs back within SLO, alerts clear.
7. **Postmortem** within a few days, blameless: impact, timeline, root cause, what went well, action items with owners. Log action items in `issues.md`. Bug fixes from the postmortem go to `backend-debug`.

## Choosing an Observability Setup

```
Single service, simple needs?          -> structured logs + metrics endpoint + health endpoints
Several services, cross-request bugs?  -> add OpenTelemetry tracing with OTLP
SLO dashboards and paging?             -> Prometheus-compatible metrics backend + burn-rate alerts + runbooks
Audit or compliance trail?             -> separate append-only audit log with long retention (not the app log)
```
