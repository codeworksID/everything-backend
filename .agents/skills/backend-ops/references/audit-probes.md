# Audit Probes and Ops Report

Probes for Step 2 of the workflow. Each probe is a content search; run it with your host's search tool (see `<shared>/host-tools.md`), or with the shell commands at the end. Search the source roots listed in `project-overview.md` (for example `src/`, `app/`, `internal/`, `cmd/`, `lib/`), not a hard-coded `src/`. Skip `node_modules`, `vendor`, `.venv`, `dist`, `build` and `target`.

A match is a lead, not a finding. Read the surrounding code before recording anything. Search only manifests that exist (no `package.json` search in a Go project).

## Observability

| Probe | Node / TS | Python | Go | Java / Kotlin |
|---|---|---|---|---|
| Unstructured logging | `console\.(log\|error\|warn)` | `\bprint\(`, `logging\.basicConfig` | `fmt\.Print`, `log\.Print` | `System\.out\.print`, `printStackTrace` |
| Structured logger present | `pino\|winston\|bunyan` | `structlog\|python-json-logger` | `log/slog\|zap\|zerolog` | `logstash-logback-encoder\|StructuredLogging` |
| Correlation ID | `correlation[-_]id\|request[-_]id\|traceparent` (all stacks, case-insensitive) | | | |
| Health routes | `health\|healthz\|livez\|ready\|readyz` near route definitions; also deploy configs (`livenessProbe`, `readinessProbe`, compose `healthcheck`) | | | |
| Metrics | `prom-client\|/metrics` | `prometheus_client\|instrumentator` | `promhttp` | `micrometer\|actuator` |
| Tracing | `@opentelemetry` | `opentelemetry` | `go.opentelemetry.io` | `opentelemetry\|javaagent` |
| Error tracking | `@sentry\|newrelic\|dd-trace` | `sentry_sdk\|ddtrace` | `sentry-go` | `sentry\|newrelic` |

Also check: `/metrics` registered on the public router; metric labels built from raw paths or user ids; log calls that include `password`, `token` or `authorization`.

## Resilience

| Probe | Pattern |
|---|---|
| Node fetch without signal | `fetch\(` then read the call for `signal` |
| axios without timeout | `axios\.create\(\|axios\.(get\|post\|put\|delete)\(` then check for `timeout` |
| Python requests without timeout | `requests\.(get\|post\|put\|patch\|delete\|request)\(` then check for `timeout=` |
| Go clients without timeout | `http\.DefaultClient\|http\.Get\(\|http\.Post\(\|&http\.Client\{\}` |
| Retries | `retry\|backoff\|tenacity\|cockatiel\|resilience4j\|Polly` then confirm they are limited to idempotent calls and jittered |
| Breakers / bulkheads | `breaker\|opossum\|gobreaker\|bulkhead\|semaphore` |
| DB timeouts | `statement_timeout\|connectionTimeoutMillis\|pool_timeout\|acquire` |

## Caching

| Probe | Pattern |
|---|---|
| Cache writes | `\.set\(\|setex\|\.put\(\|cache\.add` then check for a TTL argument |
| Key construction | `cache.*key\|:\$\{\|f".*:{` then check for tenant or user scope on per-user data |
| Invalidation order | `\.del\(\|delete\(\|invalidate` then confirm it runs after the DB commit |
| HTTP headers | `Cache-Control` then check authenticated routes do not use `public` |

## Messaging

| Probe | Pattern |
|---|---|
| Auto-ack | `noAck:\s*true\|auto_ack\s*=\s*True\|autoAck\|enable\.auto\.commit` |
| Ack placement | `\.ack\(\|basic_ack\|commitOffsets\|DeleteMessage` then confirm it follows processing |
| DLQ | `dead.?letter\|dlq\|deadLetter\|RedrivePolicy` |
| Outbox | `outbox` then check relay concurrency (`SKIP LOCKED` or a single relay) |
| Dedup | `inbox\|processed_messages\|idempot` |

## Config and Secrets

| Probe | Pattern |
|---|---|
| Scattered env reads | `process\.env\.\|os\.environ\|os\.Getenv\|System\.getenv` outside a single config module |
| Validation | `zod\|envalid\|BaseSettings\|envconfig\|@ConfigurationProperties` |
| Hard-coded secrets | `(password\|secret\|api[_-]?key\|token)\s*[:=]\s*["'][^"']{8,}` (mask any value you report) |
| Committed env files | find `.env`, `.env.*` tracked by git (`git ls-files`), excluding example templates |

## Backup and DR

- Search IaC and config for `backup_retention_period`, `point_in_time_recovery`, `deletion_protection`, `pgbackrest`, `wal-g`, `barman`, `archive_mode`, `backup` schedules.
- Look for `docs/runbooks/disaster-recovery.md` and a drill log.
- If nothing is in the repo, ask the user how backups are configured; do not assume none exist. Record "unknown" rather than a finding until confirmed.

## Shell Fallback

Bash with ripgrep (preferred) or grep:

```bash
rg -n -i -e 'console\.(log|error|warn)' src app 2>/dev/null
grep -rnE --include='*.ts' --include='*.js' 'console\.(log|error|warn)' src
```

PowerShell (Windows):

```powershell
Get-ChildItem -Path src -Recurse -File -Include *.ts,*.js |
  Where-Object { $_.FullName -notmatch '\\node_modules\\|\\dist\\' } |
  Select-String -Pattern 'console\.(log|error|warn)'
```

A probe that cannot run (tool missing, path absent) is reported as "did not run" with the error, not as clean.

## Severity Rubric

| Severity | Examples |
|---|---|
| Critical | secrets or tokens in logs, health or metrics output; PII logged on a production path; no backups for a production datastore; leaked credential in code or history |
| High | outbound calls on a request path with no timeout; retries on non-idempotent writes without idempotency keys; consumers that ack before processing; no correlation IDs across service boundaries; restore never tested for tier 1 data |
| Medium | missing liveness or readiness endpoint; `/metrics` on the public port; unbounded metric labels; no DLQ or no DLQ alert; cache keys without tenant scope on shared data; partial tracing; a probe that did not run |
| Low | naming inconsistencies, missing docs for ops endpoints, minor metric gaps |

If a finding also appears in a `backend-doctor` report, keep the higher severity and note both sources.

## Finding Format

Each finding includes:

1. File path and line (`src/clients/payments.ts:42`).
2. The probe that found it.
3. An excerpt of 2 to 5 lines. **Mask secrets**: show the first 4 characters, then `****`, then the length, for example `sk_l****(32)`. Never copy a full secret into chat, reports or memory.
4. Severity and area.
5. The principle it violates.
6. The recommended fix.

## Ops Report Template

Give this in chat at the end of the run (and in the design doc if one was requested):

```markdown
# Ops Report: <project or service> (<YYYY-MM-DD>)

## Scope
Areas reviewed: observability / resilience / caching / messaging / config / backup-DR

## Findings
| # | Severity | Area | Location | Finding | Fix |
|---|---|---|---|---|---|

## Changes Made
- <file>: <what changed>   (or "none: design only")

## Verification
| Check | Result (pass / fail / did not run) | Evidence |
|---|---|---|

## Decisions Recorded
- decisions.md: <titles>

## Open Items
- <finding> -> logged in issues.md; owner skill: <backend-implement / backend-security / backend-deploy / backend-migrate>
```
