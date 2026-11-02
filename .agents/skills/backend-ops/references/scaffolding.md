# Observability Scaffolding per Stack

Generate code only for a stack confirmed by the manifest. Match the project's existing style, logger and router. Each block lists the packages it needs; installing them is Always Ask First (`<shared>/tool-rules.md`). Check the lockfile first: the project may already have an equivalent library.

Health paths follow `observability.md` -> Health Endpoints (reuse existing routes; otherwise `/healthz` and `/readyz`).

## Node.js / Express

Packages: `pino`, `prom-client` (plus `pino-http` if you want request logs).

```javascript
// observability.js
const { randomUUID } = require('node:crypto');
const express = require('express');
const pino = require('pino');
const client = require('prom-client');

const ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: process.env.OTEL_SERVICE_NAME || 'app' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token', '*.secret'],
    censor: '[REDACTED]',
  },
});

function correlationId(req, res, next) {
  const inbound = req.get('x-correlation-id');
  const id = inbound && ID_RE.test(inbound) ? inbound : randomUUID();
  req.correlationId = id;
  req.log = logger.child({ correlation_id: id });
  res.set('x-correlation-id', id);
  next();
}

const httpDuration = new client.Histogram({
  name: 'http_server_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status_class'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

function metricsMiddleware(req, res, next) {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    // route template only; never the raw path
    const route = req.route ? req.baseUrl + req.route.path : 'unmatched';
    end({ method: req.method, route, status_class: `${String(res.statusCode)[0]}xx` });
  });
  next();
}

function startMetricsServer(port = Number(process.env.METRICS_PORT || 9464)) {
  client.collectDefaultMetrics();
  const app = express();
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  });
  return app.listen(port);
}

module.exports = { logger, correlationId, metricsMiddleware, startMetricsServer };
```

Health routes (readiness flips to 503 on shutdown; checks time out):

```javascript
let shuttingDown = false;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);

app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
app.get('/readyz', async (_req, res) => {
  if (shuttingDown) return res.status(503).json({ status: 'unavailable' });
  try {
    await withTimeout(db.query('SELECT 1'), 1500); // adapt to the project's DB client
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});
process.once('SIGTERM', () => { shuttingDown = true; /* then close the server with a deadline */ });
```

Graceful shutdown details are in `<shared>/stacks/node-typescript.md` when present.

NestJS: use `nestjs-pino` for logging and `@nestjs/terminus` for health indicators; serve metrics with `prom-client` the same way.

## Python / FastAPI

Packages: `structlog`, `prometheus-client` (or `prometheus-fastapi-instrumentator`).

```python
# observability.py
import logging
import re
import uuid

import structlog
from fastapi import FastAPI, Request

ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,128}$")

def configure_logging(level: int = logging.INFO) -> None:
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
    )

def install_correlation_id(app: FastAPI) -> None:
    @app.middleware("http")
    async def correlation_id(request: Request, call_next):
        inbound = request.headers.get("x-correlation-id", "")
        cid = inbound if ID_RE.fullmatch(inbound) else str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(correlation_id=cid)
        response = await call_next(request)
        response.headers["x-correlation-id"] = cid
        return response
```

Add a redaction processor before `JSONRenderer` that replaces values of deny-listed keys (see `observability.md` -> PII and Secret Redaction).

Metrics on an internal port:

```python
import os

from prometheus_client import start_http_server
from prometheus_fastapi_instrumentator import Instrumentator

Instrumentator().instrument(app)          # records into the default registry
start_http_server(int(os.environ.get("METRICS_PORT", "9464")))  # call once at startup
```

With several worker processes (Gunicorn or `uvicorn --workers`), use `prometheus_client` multiprocess mode (`PROMETHEUS_MULTIPROC_DIR`) or one process per container.

Health routes: `/healthz` returns `{"status": "ok"}`; `/readyz` runs `SELECT 1` with `asyncio.wait_for(..., timeout=1.5)` and returns 503 on failure or during shutdown (lifespan sets a flag). See `<shared>/stacks/python-fastapi.md` when present.

Django: `django-structlog` or `structlog` with a middleware like the one above; `django-prometheus` for metrics.

## Go (net/http and Gin)

Packages: `github.com/prometheus/client_golang`, `github.com/google/uuid` (or generate IDs another way); `log/slog` is in the standard library.

```go
package observability

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"regexp"

	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type ctxKey struct{} // unexported type: no collisions with other packages

var idRe = regexp.MustCompile(`^[A-Za-z0-9._-]{1,128}$`)

var Logger = slog.New(slog.NewJSONHandler(os.Stdout, nil))

func resolveID(inbound string) string {
	if idRe.MatchString(inbound) {
		return inbound
	}
	return uuid.NewString()
}

func WithCorrelationID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, ctxKey{}, id)
}

func CorrelationID(ctx context.Context) string {
	id, _ := ctx.Value(ctxKey{}).(string)
	return id
}

// net/http middleware
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := resolveID(r.Header.Get("X-Correlation-ID"))
		w.Header().Set("X-Correlation-ID", id)
		next.ServeHTTP(w, r.WithContext(WithCorrelationID(r.Context(), id)))
	})
}

// Metrics on an internal port, on its own mux (not http.DefaultServeMux).
func StartMetricsServer(addr string) *http.Server {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	srv := &http.Server{Addr: addr, Handler: mux}
	go func() { _ = srv.ListenAndServe() }()
	return srv
}
```

Gin variant of the middleware:

```go
func GinMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := resolveID(c.GetHeader("X-Correlation-ID"))
		c.Header("X-Correlation-ID", id)
		c.Request = c.Request.WithContext(WithCorrelationID(c.Request.Context(), id))
		c.Next()
	}
}
```

Log with the ID: `Logger.InfoContext(ctx, "order created", "correlation_id", CorrelationID(ctx))`, or wrap the handler so it adds the attribute automatically. Register health routes on the project's router (Gin, chi or the app's own `ServeMux`), not on `http.DefaultServeMux`.

## Java / Spring Boot

- Spring Boot Actuator provides liveness and readiness groups (`/actuator/health/liveness`, `/actuator/health/readiness`) and Micrometer metrics (`/actuator/prometheus` with the Prometheus registry).
- Move management endpoints to an internal port with `management.server.port`, and expose only `health` and `prometheus` (`management.endpoints.web.exposure.include=health,prometheus`).
- Logging: Logback with a JSON encoder (Spring Boot's structured logging support in recent versions, or `logstash-logback-encoder`); put the correlation ID in the MDC from a servlet filter.

## OpenTelemetry Bootstrap (environment driven)

Set the standard variables (see `observability.md` -> Tracing), then:

- **Node.js**: packages `@opentelemetry/api` and `@opentelemetry/auto-instrumentations-node`; start with `node --require @opentelemetry/auto-instrumentations-node/register dist/main.js`, or create a `NodeSDK` from `@opentelemetry/sdk-node` in a file loaded before the app.
- **Python**: packages `opentelemetry-distro` and `opentelemetry-exporter-otlp`; `opentelemetry-bootstrap -a install` installs instrumentations (a dependency install: ask first); start with `opentelemetry-instrument uvicorn app.main:app`.
- **Go**: no auto-agent; set up `go.opentelemetry.io/otel/sdk/trace` with the OTLP exporter in `main`, and wrap handlers and clients with `otelhttp` (or `otelgin`).
- **Java**: attach the OpenTelemetry Java agent with `-javaagent:/path/opentelemetry-javaagent.jar`; it reads the same `OTEL_*` variables.

## Verify After Generating

Step 1 is a local hermetic check and runs without asking. Steps 2 to 7 start the app, so run them only when every target it would touch is provably local (`<shared>/tool-rules.md` -> Production Targets); otherwise give the user the commands.

1. Type-check or build passes (read the build script first; if it runs migrations or connects to a database, treat it as an integration run).
2. Start the app in the background; wait for readiness (Command Time Budgets).
3. `curl -fsS http://localhost:PORT/healthz` and `/readyz` return 200; the response carries `x-correlation-id`. On PowerShell use `curl.exe` or `Invoke-WebRequest -UseBasicParsing`.
4. A request with `X-Correlation-ID: test-123` echoes the same ID; one with `X-Correlation-ID: bad value!` gets a fresh UUID.
5. A log line from that request is valid JSON with `level`, `timestamp` and `correlation_id`.
6. `curl -fsS http://localhost:METRICS_PORT/metrics` lists the request histogram with route templates, and the main port does not serve `/metrics`.
7. Stop the process this run started.

If a step cannot run, report it as "did not run" with the reason; never report the gap as fixed.
