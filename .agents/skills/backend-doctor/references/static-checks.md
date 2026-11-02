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

The rules, the safe vs unsafe API table per stack, and the verification steps are in `<shared>/sql-safety.md` (read it fully before this step). The table below is only the search list doctor uses to find candidates; when a hit is unclear, judge it against `_shared/sql-safety.md -> The Rules` and `-> Safe vs Unsafe APIs per Stack`. A placeholder with a separate parameter list is safe (`$1`, `?`, `:name`, `#{v}`, and psycopg `%s` with a params tuple). A value inserted into the query text is not, whatever escaping is applied first.

| Stack | Candidate SQL / query sinks | Command / code sinks |
|---|---|---|
| Node / TS | template literals with `${` or string `+` inside `query(`, `execute(`, `knex.raw(`, `.whereRaw(`, `.orderByRaw(`, `sequelize.query(`, TypeORM `.where(` / `.orderBy(`; `$queryRawUnsafe`, `$executeRawUnsafe`, `Prisma.raw(`, Drizzle `sql.raw(`, `sequelize.literal(`; `multipleStatements: true` | `child_process.exec(` / `execSync(` with interpolation; `eval(`; `new Function(`; `vm.runIn` |
| Python | `execute(f"`, `execute("..." % `, `.format(` into SQL, `text(f"`, `.order_by(text(`, `literal_column(`, `raw(f"`, `extra(where=` with interpolation, `RawSQL(` with interpolation | `subprocess` with `shell=True`, `os.system(`, `os.popen(`; `pickle.loads(`; `yaml.load(` without `SafeLoader`; `eval(` / `exec(` |
| Go | `fmt.Sprintf` result passed to `Query`, `QueryRow`, `Exec`, `Raw`, `Where` (any verb: `%s`, `%v`, `%d`); string `+` into SQL text; GORM `Where(fmt.Sprintf(`, `Order(` / `Group(` / `Select(` with a request value, `Raw(fmt.Sprintf(`, `Exec(` with interpolation | `exec.Command("sh", "-c", ...)` / `"bash", "-c"` with interpolation; `text/template` used for HTML |
| Java / Kotlin | string concatenation or `String.format` into `createQuery`, `createNativeQuery`, `Statement.execute*`, `jdbcTemplate.query`; `ORDER BY` built from input; MyBatis `${` in mapper XML or `@Select` / `@Update` annotations (`#{` is safe) | `Runtime.getRuntime().exec(` with concatenation; `ObjectInputStream.readObject` on request data |
| .NET (EF Core, Dapper, ADO.NET) | `FromSqlRaw(` / `ExecuteSqlRaw(` / `SqlQueryRaw(` with `+`, `string.Format` or `$"` built into a variable first; `SqlCommand` / Dapper `Query(` with concatenated text (`FromSql($"...")` and `FromSqlInterpolated` bind, so they are safe) | `Process.Start(` with interpolated arguments; `BinaryFormatter.Deserialize` |
| Ruby / Rails | `where("... #{`, `order(params[`, `reorder(` / `pluck(` / `group(` with request values, `find_by_sql(` / `exec_query(` / `execute(` with `#{`, `Arel.sql(` with input; LIKE without `sanitize_sql_like` | backticks / `system(` / `%x(` / `IO.popen(` with interpolation; `eval(`; `Marshal.load(`; `YAML.load(` (unsafe on old Psych) |
| PHP / Laravel / PDO | `DB::raw(`, `whereRaw(` / `orderByRaw(` / `selectRaw(` / `havingRaw(` with `$var` or `.` concatenation, `DB::statement(` / `DB::select(` with interpolation, `orderBy($request->` (column from input); PDO `->query(` / `->exec(` with concatenation, `prepare(` on a concatenated string | `exec(`, `shell_exec(`, `system(`, `passthru(`, backticks with input; `unserialize(` on request data; `eval(` |
| MongoDB / NoSQL | `$where`, `$function`, `$accumulator`, `mapReduce` anywhere near input; a request body or query object passed straight into `find(` / `findOne(` / `updateOne(` / `deleteMany(` / `aggregate(` (operator injection such as `{"password": {"$ne": null}}`); Mongoose without `sanitizeFilter` / `strictQuery`; Redis `eval(` with a script built from input; Elasticsearch `query_string` or scripts built from input | as above for the host language |

Also check the **owner predicate** (`_shared/sql-safety.md` -> rule 3). For every table that holds tenant- or user-owned rows (it has `tenant_id`, `org_id`, `account_id`, `user_id`, `owner_id` or similar, or db-schema.md marks it owned), search reads and writes that filter only by the row key: `WHERE id = $1`, `findById(`, `findByPk(`, `find(`, `get(`, `First(&x, id)`, `.find(params[:id])`, `Model::find($id)`, `findUnique({ where: { id } })`, and UPDATE / DELETE by id alone. If the query has no tenant or user predicate bound from the authenticated principal (session or token, not the request body or path), and no policy check or row-level security covers it in the same path, it is a **candidate BOLA/IDOR**. Report it with file:line, mark the category Security, and hand it to backend-security ("Needs review (backend-security)" if unconfirmed; a finding with Next skill backend-auth or backend-security if the handler visibly returns or changes another owner's row). Also flag UPDATE / DELETE with no WHERE, bulk writes over an unbounded id list, `",".join(ids)` into `IN (...)`, and LIKE patterns built from input without escaping (rules 4 to 6).

Also look for:

- **Log injection**: request values (headers, IDs, user input) written to logs without escaping newlines, or an incoming correlation ID used without a length and character limit.
- **Template injection**: user input passed as a template string to a template engine.

If the project already has a SAST tool configured (semgrep, gosec `G201`/`G202`, bandit `B608`, SpotBugs with find-sec-bugs), run it and use it to confirm. Do not install one. In `mode=review`, also read every changed repository/DAO file in full: multi-line query building escapes line-based search (`_shared/sql-safety.md` -> Verification, step 2).

Severity follows `_shared/sql-safety.md` -> Verification, step 5: a confirmed injection, an unsafe raw API fed by input, or a missing owner predicate on an owned row is **Critical when reachable from a public or low-privilege endpoint, High otherwise** (for example an admin-only internal job). Trace the route to decide; if you cannot tell, rate it Critical and say why. Unconfirmed candidates are not findings; list them under "Needs review (backend-security)" if they are worth a look. The recommendation for every injection or BOLA finding names the negative tests from `_shared/sql-safety.md` -> Verification, step 4 (Next skill backend-test) alongside the fix.

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
| Missing ownership checks | handlers that load a resource by an ID from the path and return or change it with no check against the caller; see the owner-predicate check under Injection Sinks | High; Critical if it exposes other users' or tenants' data from a public or low-privilege endpoint |
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
