# Smoke Test

Start the app, wait for it to become ready, probe its health route, and stop everything this run started. Run it only after the Target Check passes. Time limits follow `<shared>/tool-rules.md` -> Command Time Budgets (about 60s to become ready).

## 1. Find the Start Command

- Node.js: the `start` script (read it; a `prestart` script runs first and may migrate). For dev-only setups, the `dev` script, noted in the report.
- Python/FastAPI or other ASGI: `<prefix> uvicorn <module>:app --port <port>` or `<prefix> fastapi run <file>`. Find `<module>:app` by searching for `FastAPI(` or `Starlette(`. Django: `<prefix> python manage.py runserver <port> --noreload`. Flask: `<prefix> flask --app <module> run --port <port>`.
- Go: `go run ./cmd/<server>` (find the `main` package that starts the HTTP server).
- Java: `./mvnw spring-boot:run` or `./gradlew bootRun`, or the built jar.
- A `Procfile`, `Dockerfile` `CMD`, or `docker-compose.yml` service can show the canonical command. Do not start compose services that point at shared infrastructure.

If there is no start command, skip the smoke test and record "not run: no start command".

## 2. Find the Port and the Health Route

Port, in order: the `PORT` (or framework-specific) variable in the env file the app loads, the port in config files, a `--port` flag in the start script, then the framework default (Express examples often 3000, uvicorn 8000, Django 8000, Flask 5000, Spring 8080). Record where the port came from.

Before starting, check the port is free. If something already listens there, you would probe the wrong process: pick another port through the app's own setting if it has one, or skip and report.

Health route: search route definitions for `health`, `healthz`, `ready`, `readyz`, `live`, `livez`, `/status`, `actuator/health`. Probe the routes that exist. Do not assume `/health`. If none exists, record "missing health route" (Medium, Next skill backend-ops) and probe `/` only to confirm the process answers.

## 3. Start, Poll, Stop

### Bash (Linux, macOS, Git Bash)

```bash
# start in its own process group so the whole tree can be stopped
setsid npm start > /tmp/doctor-app.log 2>&1 &   # without setsid: plain "&"
APP_PID=$!
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/healthz") && [ "$code" != "000" ] && break
  sleep 2
done
echo "status=$code"
kill -- -"$APP_PID" 2>/dev/null || { pkill -P "$APP_PID"; kill "$APP_PID"; }
```

Use the scratchpad or project temp directory for the log if the host provides one. On macOS, `setsid` may be missing; then stop child processes with `pkill -P` before the parent.

### PowerShell (Windows)

```powershell
$p = Start-Process -FilePath npm.cmd -ArgumentList 'start' -PassThru -NoNewWindow `
  -RedirectStandardOutput doctor-app.log -RedirectStandardError doctor-app.err
$code = 0
for ($i = 0; $i -lt 30 -and $code -eq 0; $i++) {
  try { $code = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:$port/healthz").StatusCode }
  catch { if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode } else { Start-Sleep -Seconds 2 } }
}
"status=$code"
taskkill /PID $p.Id /T /F | Out-Null
```

`taskkill /T` stops the whole process tree (npm starts node as a child). Delete the log files this run created when done.

### Host background tools

If the host can run a command in the background and read its output, use that instead of the shell job, and stop the background task at the end. Make sure the child server process is gone (check the port is free again).

## 4. Rate the Result

| Result | Severity |
|---|---|
| Process exits during startup with a code error | High (Critical if it is a release candidate or a Production Readiness run) |
| Process exits because of missing env or an unreachable dependency | Medium "Setup", with the missing item |
| Never ready within the budget | "did not complete", with the last log lines (secrets masked) |
| Health route returns non-2xx | High |
| Health route missing | Medium |
| Ready and 2xx | pass, recorded in Commands Executed |

Always confirm the port is free after stopping. An orphaned server is a run defect: report it and give the user the PID.
