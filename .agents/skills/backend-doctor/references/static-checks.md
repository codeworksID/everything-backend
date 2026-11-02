# Static Anti-Pattern Checks

Static checks support the dynamic checks. Each pattern below finds candidates; read every hit (with a few lines of context, since queries often span lines) and report only confirmed findings. Skip dependency and build folders (`node_modules`, `vendor`, `.venv`, `venv`, `env`, `site-packages`, `dist`, `build`, `target`) and discard any hit outside the project's source roots.

Doctor covers obvious anti-patterns only. A security review (threat model, OWASP API Top 10 walk-through, SSRF, mass assignment, deserialization, misconfiguration, git-history secret scan, supply chain) belongs to backend-security. When doctor finds a security issue, report it and recommend a backend-security review.

## Contents

- Injection sinks per stack
- Secrets in the working tree
- Python SAST with bandit
- Architecture and quality checks
- Performance anti-patterns
- Resilience anti-patterns
- Mapping to report rows

## Injection Sinks per Stack

A placeholder with a separate parameter list is safe (`$1`, `?`, `:name`, and psycopg `%s` with a params tuple). A value inserted into the query text is not.

| Stack | Candidate SQL sinks | Command / code sinks |
|---|---|---|
| Node / TS | template literals with `${` inside `query(`, `execute(`, `knex.raw(`, `.whereRaw(`, `sequelize.query(`; `$queryRawUnsafe`, `$executeRawUnsafe`; string `+` into SQL text | `child_process.exec(` / `execSync(` with interpolation; `eval(`; `new Function(`; `vm.runIn` |
| Python | `execute(f"`, `execute("..." % `, `.format(` into SQL, `text(f"`, `raw(f"`, `extra(where=` with interpolation | `subprocess` with `shell=True`, `os.system(`, `os.popen(`; `pickle.loads(`; `yaml.load(` without `SafeLoader`; `eval(` / `exec(` |
| Go | `fmt.Sprintf` result passed to `Query`, `QueryRow`, `Exec`, `Raw`, `Where` (any verb: `%s`, `%v`, `%d`); string `+` into SQL text | `exec.Command("sh", "-c", ...)` / `"bash", "-c"` with interpolation; `text/template` used for HTML |
| Java / Kotlin | string concatenation or `String.format` into `createQuery`, `createNativeQuery`, `Statement.execute*`, `jdbcTemplate.query` | `Runtime.getRuntime().exec(` with concatenation; `ObjectInputStream.readObject` on request data |

Also look for:

- **Log injection**: request values (headers, IDs, user input) written to logs without escaping newlines, or an incoming correlation ID used without a length and character limit.
- **Template injection**: user input passed as a template string to a template engine.

If the project already has a SAST tool configured (semgrep, gosec, bandit, SpotBugs with find-sec-bugs), run it and use it to confirm. Do not install one.

Severity: confirmed injection is Critical. Unconfirmed candidates are not findings; list them under "Needs review (backend-security)" if they are worth a look.

## Secrets in the Working Tree

1. Tracked env files: `git ls-files -- .env ".env.*"` lists env files committed to the repo. Ignore `.env.example`, `.env.sample`, `.env.template` unless they hold real-looking values.
2. `.gitignore` covers `.env` and `.env.*` (with an exception for the example files).
3. Content search, outside dependency folders, for:
   - private key headers: `-----BEGIN [A-Z ]*PRIVATE KEY-----`
   - AWS access key IDs: `AKIA[0-9A-Z]{16}`
   - assignments of string literals to names like `api_key`, `apiKey`, `secret`, `password`, `token`, `client_secret` (skip obvious placeholders and test fixtures, but note fixtures that look like real keys)
   - connection strings with inline credentials: `://[^/:@\s]+:[^@\s]+@`
4. If gitleaks is already installed, scan the working tree with redaction (for example `gitleaks dir . --redact` on recent releases, `gitleaks detect --no-git --redact` on older ones). A full git-history scan is backend-security's job.

### Masking (always)

Never copy a secret value into the chat, the report, issues.md, or a checkpoint. Show the location, the kind of secret, the first 4 characters and the length, for example `AKIA**** (20 chars)` or `password = "hu**" (14 chars)`. This applies to command output excerpts and startup logs too.

### Remediation order (for the report)

1. Revoke or rotate the credential first (Always Ask First; Next skill backend-ops or the owner of the secret). Removing it from code does not make it safe: it is already in git history and possibly in clones and CI logs.
2. Remove it from code and load it from the environment or a secret manager (Next skill backend-implement).
3. Scan and, if the team agrees, scrub git history (Next skill backend-security).

A committed live secret is Critical.

## Python SAST with bandit

Do not run `bandit -r .` from the project root: bandit's default excludes do not cover in-project virtualenvs, so it scans third-party packages. Use one of:

- `<prefix> bandit -r <package-dir>` (the project's own source package), or
- `<prefix> bandit -r . -x ./.venv,./venv,./env,./node_modules,./build,./dist`
- add `-c pyproject.toml` when pyproject has a `[tool.bandit]` section.

Discard any result whose path is outside the source roots. Bandit's own severity is input, not the final rating: confirm each hit by reading it, then rate it with doctor's severity table.

## Architecture and Quality Checks

These back the Architecture Findings in the report. Each grade cites at least one file.

| Check | How to look | Typical rating |
|---|---|---|
| Fat controllers / handlers | list symbols (LSP if available, else search for route registrations) in route files; flag handlers with business branching, DB calls or more than about 50 lines | Medium (High if business rules are duplicated across endpoints) |
| Layering and dependency direction | search controllers for direct ORM or driver imports; search domain or service code for HTTP framework imports | Medium |
| God services | files over about 800 lines or with many unrelated public methods | High |
| Missing input validation | route handlers that accept a body or query but reference no schema (Zod, Joi, class-validator, Pydantic, go-playground/validator, Bean Validation) | High on create, update, auth and payment endpoints; Medium elsewhere |
| Missing ownership checks | handlers that load a resource by an ID from the path and return or change it with no check against the caller | High (Critical if it exposes other users' data) |
| Generic error responses | `status(500)` for client errors, `raise Exception`, untyped error returns, stack traces in responses | Medium |
| Transaction ownership | multi-step writes outside a transaction; transactions opened in controllers | High when an invariant can break |

## Performance Anti-Patterns

Doctor does a static performance review. It does not load-test or profile; mark Performance as "not measured" unless the project's own benchmark ran. A specific regression ("p95 doubled after the release") goes to backend-debug.

- N+1: a DB call inside a loop over query results; ORM lazy loading in list endpoints.
- Unbounded queries: list endpoints without pagination or a limit; `SELECT *` on hot paths.
- Missing indexes: filter or join columns in hot queries with no matching index in db-schema.md or the migrations.
- Blocking work on the request path: sync file or crypto calls in async handlers; long jobs that belong on a queue.

Rating: Medium by default; High when the endpoint is a documented hot path.

## Resilience Anti-Patterns

- Outbound HTTP or RPC clients with no timeout (for example `fetch` or axios without a timeout or `AbortSignal`, `requests.get` without `timeout=`, Go `http.Client{}` or `http.Get` with no `Timeout`).
- Retries on non-idempotent calls, or retries without backoff.
- No connection-pool limits for the database.

Rating: Medium, Next skill backend-ops.

## Mapping to Report Rows

| Report row | Evidence that grades it |
|---|---|
| Code Quality | lint and type results, fat-controller and god-service checks |
| Security | dependency audit, injection, secrets, validation and ownership checks (a full review is backend-security) |
| Performance | static performance checks only, labelled "static" |
| Dependencies | audit results (production and dev separately) |
| Testing | test results and measured coverage |
| Layering, SOLID/SRP, Dependency Direction, Transaction Ownership | the architecture checks above |
| Normalization / Data Integrity | db-schema.md and migrations: missing foreign keys, unique constraints, NOT NULL on required fields |
