# Health Routes and Graceful Shutdown

Deploys depend on two things the app must provide: routes that tell the platform when to route traffic and when to restart, and clean draining on SIGTERM. backend-ops owns the code for these; this file is the contract deploy checks against. The stack files in `<shared>/stacks/` have full snippets for Node and Python.

## Contract

| Route | Meaning | Checks | Status codes |
|---|---|---|---|
| `/healthz` (liveness) | The process is alive and not deadlocked | Nothing external | 200 |
| `/readyz` (readiness) | Send me traffic | Hard dependencies (DB, required cache) with a 1-2 s timeout each; returns 503 while shutting down | 200 or 503 |

- Use the project's existing routes if it has them (for example `/health` and `/ready`, or Spring Boot Actuator's `/actuator/health/liveness` and `/actuator/health/readiness`). Record the actual paths in `deployment.md` -> `## Health Probes` and use them in every probe, healthcheck and smoke test. Do not add a second set.
- Exclude both from auth, rate limiting and request logging.
- Never return config, versions, hostnames or error details in the body. A status and a per-check `ok` or `fail` is enough.
- Soft dependencies (optional caches, third-party APIs) do not fail readiness; they degrade and alert.

## Shutdown Sequence

On SIGTERM:

1. Mark the app not ready, so `/readyz` returns 503.
2. Keep serving for a short delay (or rely on the platform's preStop sleep) so load balancers stop sending traffic.
3. Stop accepting new connections and let in-flight requests finish.
4. Stop consumers and background jobs; finish or release in-progress messages.
5. Close database and cache connections.
6. Exit 0. If draining takes longer than a deadline (below the platform's grace period), exit 1.

Handle a second signal without starting a second shutdown.

## Express 4 Example (TypeScript)

```typescript
let shuttingDown = false;

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));

app.get('/readyz', async (_req, res) => {
  if (shuttingDown) return res.status(503).json({ status: 'shutting_down' });
  const [db, cache] = await Promise.allSettled([
    withTimeout(dbPing(), 1500),
    withTimeout(cachePing(), 1500),
  ]);
  const checks = { db: db.status === 'fulfilled', cache: cache.status === 'fulfilled' };
  const ok = Object.values(checks).every(Boolean);
  res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'not_ready', checks });
});

const server = app.listen(port);

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(JSON.stringify({ msg: 'shutdown', signal }));
  const deadline = setTimeout(() => process.exit(1), 25_000);
  deadline.unref();
  setTimeout(() => {
    server.close(async () => {
      try {
        await Promise.allSettled([dbDisconnect(), cacheDisconnect()]);
        process.exit(0);
      } catch {
        process.exit(1);
      }
    });
    server.closeIdleConnections?.();
  }, 5_000); // drain delay; set to 0 if the platform runs a preStop sleep
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

- `Promise.allSettled` plus timeouts means a hung or rejected ping becomes a 503, never an unhandled rejection. Express 5 forwards rejected promises to the error handler; on Express 4 every async handler must catch its own errors.
- The deadline timer starts at the signal, so it already includes the drain delay. Keep any preStop sleep plus the deadline below the platform's grace period (Kubernetes `terminationGracePeriodSeconds`, default 30 s).

## Other Stacks

- **FastAPI / Python**: lifespan shutdown plus uvicorn `--timeout-graceful-shutdown`; see `<shared>/stacks/python-fastapi.md`.
- **Go**: `signal.NotifyContext(ctx, syscall.SIGTERM, os.Interrupt)`, set a ready flag to false, then `srv.Shutdown(ctxWithTimeout)`; register the routes on the app's router (Gin, chi, or `http.ServeMux`).
- **Spring Boot**: `server.shutdown=graceful`, `spring.lifecycle.timeout-per-shutdown-phase=20s`, and Actuator probes enabled; readiness flips to refusing traffic during shutdown automatically.
