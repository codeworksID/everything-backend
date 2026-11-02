# OWASP API Security Top 10 (2023) Review

Read this in Step 3. For each item: run the searches (search file contents; `rg -n` patterns shown, case-insensitive where noted), read every hit in context with its middleware, decide, and record a verdict.

Verdicts: **pass** (state what you checked), **finding** (list finding IDs), **not applicable** (state why). A search hit alone is never a finding.

Exclude `node_modules`, `vendor`, `.venv`, `venv`, `dist`, `build`, generated clients and migrations from searches (`rg` honors `.gitignore`; add `-g '!<dir>'` for the rest).

Stack hints used below: **Node** (Express, Fastify, NestJS, Prisma, TypeORM, Sequelize, Mongoose), **Py** (FastAPI, Django/DRF, Flask, SQLAlchemy), **Go** (net/http, chi, gin, gorm, sqlx), **Java** (Spring, JPA).

## API1: Broken Object Level Authorization (BOLA / IDOR)

Risk: a user reads or changes another user's or tenant's object by changing an ID.

Search:
- Routes with object IDs: `:id`, `:[a-z]+Id`, `\{[a-z_]*id\}` in route files; `@(Get|Put|Patch|Delete)Mapping\(.*\{`; `@(app|router)\.(get|put|patch|delete)\(.*\{`; `\.(get|put|patch|delete)\(['\"][^'\"]*:`.
- Fetch by ID without owner or tenant filter: `findUnique\(\{\s*where:\s*\{\s*id`, `findById\(`, `findByPk\(`, `findOne\(\{\s*where:\s*\{\s*id`, `\.get\(\w+,\s*\w*id\)` (SQLAlchemy `session.get`), `objects\.get\(pk=`, `objects\.get\(id=`, `First\(&\w+,\s*\w*[iI][dD]\)`, `findById\(` (JPA), raw `WHERE id = ` without `tenant_id`/`owner_id`/`user_id`.

Read: for every `/{id}` route, the handler, service and query. Find where the principal (`req.user`, `current_user`, `ctx.Value`, `@AuthenticationPrincipal`) is compared with the object's owner or tenant.

A correct query is not an access check: `WHERE id = $1` with a client-supplied id fails API1 even when it is fully parameterized. Apply `<shared>/sql-safety.md` -> The Rules, rule 3 (owner predicate) and rule 4 (bounded writes): the owner or tenant value is bound from the authenticated principal (session or verified token), never from the path, query or body.

Pass when: every object route scopes the query by owner or tenant (or checks it after load and returns 404/403), including list, update, delete, export, bulk and nested routes, and the owner value comes from the principal. Row-level security or a repository that always injects the tenant counts if you confirm it cannot be bypassed (for RLS: the app role lacks `BYPASSRLS` and the tenant setting comes from the principal).

Fix: scope queries by principal (`where: { id, ownerId: user.id }`), central policy check, 404 for objects of other tenants. Owner: `backend-auth` (policy design) or `backend-debug` (missing check in one handler).

## API2: Broken Authentication

Risk: attackers impersonate users through weak login, token or session handling.

Search:
- JWT misuse: `jwt\.decode\(` (without verify), `verify_signature['\"]?\s*:\s*False`, `options=\{[^}]*verify`, `ignoreExpiration`, `algorithms?\s*[:=]\s*\[?['\"]none`, `ParseUnverified`, `alg.*none` (case-insensitive), `HS256` next to a public key.
- Weak hashing: `md5|sha1|sha256\(` near `password`, `createHash\(['\"](md5|sha1)`, `hashlib\.(md5|sha1)`, plain comparison `password\s*===?\s*`.
- Tokens in URLs: `[?&](token|api_key|apikey|access_token)=`, `req\.query\.(token|apiKey)`.
- Login throttling: rate limiter applied to login, reset, OTP routes (`express-rate-limit`, `@nestjs/throttler`, `slowapi`, `django-ratelimit`, `bucket4j`, `tollbooth`).
- Session handling: session ID regenerated on login (`req.session.regenerate`, `cycle_key`, `changeSessionId`), cookie flags (see config reference).

Read: the auth middleware, token verification, login, logout, refresh, password reset and MFA code paths. Compare with `backend-auth` -> references/verification-and-review.md (negative-test matrix) if that skill is installed.

Pass when: tokens are verified with a pinned algorithm, issuer, audience and expiry; passwords use argon2id, bcrypt or scrypt; login, reset and OTP are throttled; reset tokens are single-use and expire; sessions rotate on login and die on logout.

Fix owner: `backend-auth`.

## API3: Broken Object Property Level Authorization

Two halves: **mass assignment** (client writes fields it should not) and **excessive data exposure** (server returns fields it should not).

Search, mass assignment:
- Node: `\.\.\.req\.body`, `Object\.assign\(\w+,\s*req\.body`, `data:\s*req\.body`, `\.create\(req\.body`, `\.update\(req\.body`, `new \w+\(req\.body\)`, `\.set\(req\.body`.
- Py: `\*\*(request\.data|payload|body|data)\b`, `\.model_dump\(\)|\.dict\(\)` passed into a model constructor, `fields\s*=\s*['\"]__all__`, `setattr\(\w+,\s*k(ey)?,`.
- Java: `@RequestBody\s+\w+Entity`, `@RequestBody` binding a JPA `@Entity` class directly; `BeanUtils\.copyProperties\(.*request`.
- Go: `json\.NewDecoder\(r\.Body\)\.Decode\(&\w+\)` into a DB model, `ShouldBindJSON\(&\w+\)` into a gorm model, `Updates\(\w+\)` with a map from the request.
- Rails-style: `permit!`.

Search, data exposure:
- Returning ORM objects directly: `res\.(json|send)\(\w*(user|account|customer)`, `return \w+` from handlers without a response schema (FastAPI routes without `response_model`), `serializers\.ModelSerializer` with `__all__`, `toJSON` absent on entities with secrets.
- Sensitive fields: `password(_hash)?|passwordHash|secret|token|mfa|ssn|api_?key` in response DTOs or serializers.
- GraphQL: types exposing internal fields without field-level resolvers checks.

Pass when: create and update bodies are explicit allowlists (DTO, schema, `pick`), server-owned fields (`id`, `role`, `isAdmin`, `tenantId`, `ownerId`, `status`, `balance`) are never taken from the body, and responses use explicit output schemas.

Fix owner: `backend-api-design` (contract allowlist) plus `backend-debug` (handler fix).

## API4: Unrestricted Resource Consumption

Search:
- Body limits: `express\.json\(\)` without `limit`, `bodyParser`, `bodyLimit` (Fastify), `client_max_body_size`, `DATA_UPLOAD_MAX_MEMORY_SIZE`, `MaxBytesReader`, `spring\.servlet\.multipart\.max-`.
- Pagination: `limit|pageSize|per_page|take` read from the query without a maximum (`Math\.min`, `le=`, `max\(`).
- Rate limiting: limiter libraries listed in API2; gateway or ingress rate limits in deploy config.
- Timeouts: outbound HTTP clients without timeouts (`axios\.create\(` without `timeout`, `requests\.(get|post)\(` without `timeout=`, `http\.Client\{` without `Timeout`), DB statement timeouts.
- Expensive work per request: regex built from input (`new RegExp\(req`, `re\.compile\(.*request`), image or PDF processing, zip extraction, bulk endpoints without item caps, GraphQL depth or cost limits (`depthLimit`, `graphql-cost-analysis`, `max_depth`).
- Paid side effects: SMS, email or AI calls triggered per request without per-user quotas.

Pass when: body size, page size, array and string lengths, upload size, timeouts and per-client rate limits all have explicit bounds, and paid side effects have quotas.

Fix owner: `backend-implement` (limits in code), `backend-ops` (rate-limit infra, WAF).

## API5: Broken Function Level Authorization (BFLA)

Search:
- Admin and internal routes: `/admin`, `/internal`, `/debug`, `/ops`, `/manage`, `isAdmin`, `role\s*===?`, `hasRole|hasAuthority|@PreAuthorize|@Roles\(|permission_classes|Depends\(.*(admin|role)`, `RequireRole`.
- Routes registered before or outside the auth middleware: read the router setup order (`app\.use\(auth` vs route registration), Nest guards (`@UseGuards`, global guards), FastAPI dependencies at router level, Spring `SecurityFilterChain` matchers (`permitAll\(\)`, `anyRequest\(\)`).
- Method gaps: a `GET` protected but `DELETE`/`PUT` on the same path is not.

Read: build a table of route -> required role. Compare it with `api-patterns.md` access rules.

Pass when: every privileged function has a server-side role or permission check, the default is deny, and no admin route relies on being hidden.

Fix owner: `backend-auth`.

## API6: Unrestricted Access to Sensitive Business Flows

Identify flows that hurt the business when automated: signup, referral or coupon redemption, checkout, ticket or stock reservation, password reset, OTP send, invitations, voting, reviews, posting content.

Search: route names and handlers for `signup|register|coupon|redeem|checkout|reserve|invite|otp|verify|reset|referral|vote|review`.

Read: whether each flow has per-account and per-IP or device limits, quotas, idempotency, anti-automation (CAPTCHA or proof of work where it fits), and alerts for abuse.

Pass when: each sensitive flow has limits matched to its business risk, or the threat model accepts the risk with a reason.

Fix owner: `backend-implement`, with `backend-ops` for alerting.

## API7: Server-Side Request Forgery (SSRF)

Search outbound calls whose URL or host can come from input:
- Node: `fetch\(|axios(\.\w+)?\(|got\(|request\(|http\.get\(|undici`.
- Py: `requests\.(get|post|request)\(|httpx\.|urllib\.request|aiohttp`.
- Go: `http\.(Get|Post|NewRequest)|client\.Do\(`.
- Java: `RestTemplate|WebClient|HttpClient|new URL\(`.
- Features: webhook target URLs, "import from URL", avatar or image fetch, link previews, PDF or HTML rendering (headless browsers), XML parsers with external entities.

Read: trace the URL back to its source. If it comes from a request, a DB field users can set, or a third-party response, check the guard.

Pass when: user-influenced URLs go through an allowlist of schemes and hosts, or a guard that resolves DNS and blocks private, loopback, link-local (`169.254.169.254`) and IPv6 equivalents at connect time; redirects are off or re-checked; responses are not echoed raw; timeouts and size caps exist.

Fix owner: `backend-debug` (guard in the call path) or `backend-implement` (shared safe HTTP client).

## API8: Security Misconfiguration

Run the checklist in `config-and-privacy.md` -> Configuration (CORS, headers, TLS, cookies, debug, error leakage, logging, container). The verdict follows from those results.

Fix owner: `backend-implement` for app config, `backend-deploy` for ingress and container config.

## API9: Improper Inventory Management

Search and compare:
- Routes in code (Step 1 list) vs the OpenAPI spec and `api-patterns.md` inventory: undocumented routes, documented routes that no longer exist.
- Old versions still mounted: `/v0`, `/v1` beside `/v2`, `legacy`, `deprecated`.
- Test and debug endpoints in production code: `/test`, `/debug`, `/seed`, `/reset`, `__debug__`, `actuator`, `/metrics` exposed publicly.
- API docs and consoles reachable in production: `swagger-ui`, `/docs`, `/redoc`, `graphiql`, `playground`, introspection.
- Non-production environments using production data or secrets (from `deployment.md` and env files).

Pass when: the inventory matches the code, retired versions are removed or have a sunset date, and debug and docs surfaces are disabled or protected in production.

Fix owner: `backend-api-design` (inventory, deprecation), `backend-deploy` (environment exposure).

## API10: Unsafe Consumption of APIs

Search third-party integrations (payment, email, maps, AI, partner APIs) using the outbound-call patterns from API7, plus SDK clients.

Read:
- Responses are validated against a schema before use; no blind trust because the source is "a partner".
- TLS verification is on (`rejectUnauthorized:\s*false`, `verify\s*=\s*False`, `InsecureSkipVerify:\s*true`, `NODE_TLS_REJECT_UNAUTHORIZED` are findings).
- Timeouts, retries with backoff and circuit breaking exist; redirects are not followed blindly.
- Data from third parties is never passed into SQL, shell, templates or file paths unescaped.
- Inbound webhooks verify signatures (see below).

Pass when: every integration validates input, verifies TLS, and has timeouts.

Fix owner: `backend-implement`; resilience patterns with `backend-ops`.

## Beyond the Top 10

Check these in the same pass. Map findings to the closest Top 10 item or mark them "other".

- **Injection (SQL and NoSQL)**: run the full review in "Injection Review" below. A quick grep is not enough for this item.
- **Command and template injection**: shell (`exec\(|execSync\(|spawn\(.*shell:\s*true|subprocess.*shell=True|os\.system|Runtime\.getRuntime\(\)\.exec`), template injection (`render_template_string`, user-controlled template names). Pass when commands use argument arrays without a shell and templates are fixed files.
- **Unsafe deserialization**: `pickle\.loads|yaml\.load\(|marshal\.loads|ObjectInputStream|node-serialize|unserialize\(|jsonpickle|XMLDecoder` (for `yaml.load`, a finding only without `Loader=SafeLoader`), XML parsers with external entities enabled.
- **Path traversal**: file paths built from input (`path\.join\(.*req\.|open\(.*request\.|os\.Open\(.*r\.`, `sendFile\(`, `FileResponse\(`). Pass when the resolved path is checked to stay under a base directory.
- **File uploads**: size limits, type checked by content (magic bytes) not only extension, files stored outside the web root or in private buckets, `Content-Disposition: attachment` on download, malware scanning where users share files.
- **Crypto misuse**: `Math\.random\(\)` or `random\.` for tokens, ECB mode, static IVs, hard-coded keys, `crypto\.createCipher\(` (deprecated, no IV).
- **Webhook verification**: signature check with constant-time compare (`timingSafeEqual`, `hmac\.compare_digest`, `hmac\.Equal`), timestamp tolerance, event ID stored for replay protection, raw body used for the signature.
- **Open redirects**: `res\.redirect\(req\.(query|body)`, `RedirectResponse\(.*request`, `next=` parameters without an allowlist.
- **CSRF** on cookie-authenticated state-changing routes: covered by `backend-auth`; record the verdict here under API2.

## Injection Review

Read `<shared>/sql-safety.md` in full first; it is the standard this review applies (rules, the safe vs unsafe API table per stack, and Verification). Do not restate it in the report; cite the rule number in each finding (for example "violates sql-safety rule 2").

Sources of untrusted input include the database itself. **Second-order injection**: a value stored earlier (a display name, a saved filter, a report definition, a column name kept in a settings table) and later concatenated into SQL is as dangerous as a request value. Trace stored values that reach query text, not only request fields.

### Checklist (sql-safety.md -> The Rules)

Record pass, finding or not applicable for each rule, with `file:line` evidence.

1. **Values bound**: Every query passes values separately from the SQL text, including admin routes, jobs and migrations.
    Search: `` query\(`.*\$\{ ``, `execute\(f['\"]`, `\.format\(.*(SELECT|INSERT|UPDATE|DELETE)`, `\+\s*\w+.*(WHERE|AND|OR)\b`, `fmt\.Sprintf\(.*(SELECT|INSERT|UPDATE|DELETE|WHERE)`, `String\.format\(.*(SELECT|WHERE)`, `"\s*\+\s*\w+\s*\+\s*"` near SQL keywords
2. **Identifiers allowlisted**: Sort, column, table, direction and JSON path come from a server-side map; unknown values return 400.
    Search: `orderBy\(|order_by\(|ORDER BY.*\$\{|Order\(|sort(By|Field)?\s*=\s*req`, `ASC|DESC` built from input, `sql\.Identifier`, `format\('%I'`
3. **Owner predicate**: covered under API1; copy that verdict here.
4. **Writes bounded**: UPDATE and DELETE include key and owner; no `WHERE 1=1` string building; bulk ids validated and capped.
    Search: `WHERE 1\s*=\s*1`, `(UPDATE|DELETE)[^;]*$` without `WHERE`, `deleteMany\(|updateMany\(` (check the filter includes key and owner)
5. **Array binding for lists**: IN lists bound as arrays or expanded by the driver, length capped.
    Search: `join\(['\"],['\"]\)` near `IN`, `IN \(\$\{`, `IN \(" \+`
6. **LIKE escaped and bound**: `%`, `_` and `\` escaped, `ESCAPE` clause present.
    Search: `LIKE\s*['\"]%.*\$\{`, `LIKE '%" \+`, `ILIKE`, `contains\(|icontains`, `sanitize_sql_like`
7. **No raw/unsafe APIs with input**: nothing from the "Unsafe with user input" column of the stack table in sql-safety.md receives input.
    Search: `\$queryRawUnsafe|\$executeRawUnsafe|Prisma\.raw\(|sql\.raw\(|knex\.raw\(|whereRaw\(|orderByRaw\(|sequelize\.literal\(|literal_column\(|text\(f|\.extra\(|RawSQL\(|FromSqlRaw\(|ExecuteSqlRaw\(|createNativeQuery\(|\$\{[^}]+\}` in MyBatis XML, `find_by_sql|DB::raw\(`
8. **Dynamic SQL in the DB**: PL/pgSQL `EXECUTE` uses `format('%I')` and `USING`; T-SQL uses `sp_executesql`; `SECURITY DEFINER` functions set `search_path`.
    Search: `EXECUTE\s+['\"].*\|\|`, `EXEC\s*\(`, `SECURITY DEFINER` in migrations and `.sql` files
9. **NoSQL operators**: Scalars rejected when objects arrive; `$`-prefixed keys stripped; no `$where`/`$function`/`$accumulator`/`mapReduce` with input; Mongoose `sanitizeFilter` or `strictQuery`; Redis Lua and search queries not built from strings.
    Search: `find(One)?\(req\.(body|query)`, `\$where|\$function|\$accumulator|mapReduce`, `sanitizeFilter|strictQuery|express-mongo-sanitize`, `eval\(|EVAL ` with concatenation, `query_string`
10. **Boundary validation**: Request schemas enforce type, length, format and enums; noted as defense in depth only.
    Search: `zod|pydantic|@Valid|binding:"` on handlers that query
11. **Least-privilege DB role**: App role has DML only on its schema; no `SUPERUSER`, `BYPASSRLS`, DDL, file or program privileges; migrations use a separate role; multi-statement off; `statement_timeout` set.
    Search: `multipleStatements:\s*true`, `GRANT ALL|SUPERUSER|BYPASSRLS|pg_read_server_files|pg_execute_server_program|FILE ON`, `statement_timeout`, the `DATABASE_URL` user name compared with the migration user in config and `deployment.md`
12. **Errors don't leak SQL**: DB errors map to generic API errors; no driver message, query text or stack in responses.
    Search: `err\.message|e\.args|str\(e\)|getMessage\(\)` returned in responses near DB calls, `detail=str\(`

For rule 11 you usually cannot query a live database. Read grants in migrations, infra code and `deployment.md`; if the role's privileges cannot be seen, record "Not assessed: role grants not in repo" and give the user the check to run (`\du` and `\dp` in psql, `SHOW GRANTS` in MySQL).

### Verification (sql-safety.md -> Verification 1-4)

1. **Static search**: the rule searches above plus the unsafe API table, over all source roots. Read every hit in context.
2. **Read every repository/DAO/query file** reached from an entry point in scope, including query builders split across lines and helper functions that assemble fragments.
3. **SAST**: `semgrep scan --config p/sql-injection --config p/<language> --metrics=off` (installing semgrep is Always Ask First), `bandit -r <src> -t B608` for Python, `gosec -include=G201,G202 ./...` for Go. Record each tool as run or "Not run" with the exact command.
4. **Negative tests**: check that the hostile payload tests from sql-safety.md exist for each endpoint taking a search, filter, sort, id or free-text parameter. Missing tests are a finding (Medium, owner `backend-test`) even when the code is safe. Run them only against a local instance this run started.

### Verdict and Severity

- Pass only when all twelve rules pass or are not applicable with a reason, and Verification 1-3 ran (or are listed under "Not run").
- String-built SQL or NoSQL with untrusted input (including second-order), an unsafe raw API with input, or a missing owner predicate: **Critical** when reachable from a public or low-privilege endpoint, **High** otherwise (sql-safety.md -> Verification 5). Map SQL/NoSQL injection to CWE-89 / CWE-943, owner predicate gaps to API1 (CWE-639).
- Rules 10-12 gaps alone (no injection path) are Medium unless they combine with another finding.
- Fix owner: `backend-debug` (one query plus regression test), `backend-refactor` (a pattern across many files), `backend-ops` or `backend-deploy` (DB role and grants).
