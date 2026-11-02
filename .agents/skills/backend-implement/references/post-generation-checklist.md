# Post-Generation Checklist

Run every check below after generating or modifying code, before reporting. The checks are regex patterns for the host's content-search tool, so they work the same on Windows, macOS and Linux.

## Scope

- Scan only the files this run created or changed: the checkpoint's `created_files` and `modified_files`. Get them with `node <shared>/scripts/checkpoint.js status --skill backend-implement --feature <slug> --json`.
- Without a checkpoint, use the files whose `git status --porcelain` entry is new or changed since the run started, plus any file from `pre_existing_changes` that this run edited.
- Map files to layers (transport, service, domain, repository) from `project-overview.md` -> Structure, or from the layouts in `references/greenfield.md` (Node `src/`, FastAPI `app/`, Go `internal/`, Spring `src/main/java/`). Never assume `src/`.
- Run each pattern with the host's content-search tool (regex; case-insensitive where noted), restricted to the scoped files by an explicit file list or a file pattern. Use a shell search (`grep -rnE` in bash, `Select-String -Pattern` in PowerShell) only when the host has no search tool. Never pipe to `/dev/null` or rely on exit codes: `grep` exits 1 when nothing matches, and that is a pass, not an error.

## Reporting

- Each check reports: files scanned (count), findings as `file:line`, and a verdict: pass, fixed, justified, not applicable, or not run.
- No matches is a valid result, not a tool error.
- "Not applicable": this run changed no files in the check's layer. "Not run": the path does not exist, or the tool failed or is missing. Never report either as pass.
- A hit is a candidate. Read the line and its surroundings before changing code.

### Exit criterion

The checklist is **clean** when every applicable check ran and every finding is either fixed or listed in the summary with `file:line` and a one-line justification.

These findings can never be justified, only fixed (`<shared>/sql-safety.md` -> Verification, step 5, and `<shared>/secure-coding.md` -> Verification, step 5): a query built from strings with untrusted input, an unsafe raw API called with input, a missing owner predicate on a tenant- or user-owned row, a missing authentication or role check on a non-public route, and a request value reaching a shell, file path, outbound URL, deserializer, template compiler or `eval` without its containment (check 13). While any of them is open the verdict is **not clean**, whatever else passed. Severity: Critical when the code is reachable from a public or low-privilege endpoint, High otherwise.

If a check could not run (for example no LSP and no type-checker installed), the verdict is **incomplete**, not clean. List the check, the reason, and the exact command the user should run. Do not loop trying to make a missing tool appear.

## 1. Controllers contain no business logic

- Scope: changed transport files (`controllers/`, `handlers/`, `routes/`, `api/`, or the project's equivalent).
- Pattern: `\b(if|else|switch|case|for|while|match|select)\b`
- Pass: every hit is input validation, auth or error-to-HTTP mapping, or response shaping.
- If failed: move the business branch into a service method. The handler only parses input, calls `service.<action>(dto)`, and maps the result or error.

## 2. Services own transaction boundaries

- Scope: changed transport files.
- Pattern (case-insensitive): `\b(begin|commit|rollback)\b|transaction|@Transactional|\bBeginTx?\(|\batomic\(`
- Pass: zero hits in transport files.
- If failed: open the transaction in the service method. Controllers never start or commit transactions.

## 3. No SQL built from strings

The rules behind this check are in `<shared>/sql-safety.md` -> The Rules (1, 2, 5, 6, 7). This check is its static search step.

- Scope: all changed source files.
- Pattern (case-insensitive): `` \b(select|insert|update|delete)\b.*(\$\{|["'`]\s*\+|\+\s*["'`]|["']\s+%\s*[(\w]|\.format\(|Sprintf\()|(\bf["']|Sprintf\(|\.format\().*\b(select|insert|update|delete)\b ``
- Pass: zero hits, or each hit is shown to be safe after reading it:
  - tagged templates that parameterize `${}` (Prisma `$queryRaw`, Drizzle `sql`, `sql` tags from postgres.js or slonik);
  - interpolated identifiers taken from a fixed server-side allowlist, never the client's string.
- `%s` and `?` placeholders passed with a separate params argument, as in `cur.execute(sql, params)`, are safe and do not match.
- Known false positive: a `%` inside a `LIKE` literal (for example `LIKE ' %abc'`).
- Known miss: the `%` operator pattern needs whitespace after the closing quote, so `"..."%x` without spaces is caught only by the file read below.
- Second pattern, unsafe raw APIs (the "Unsafe with user input" column of `<shared>/sql-safety.md` -> Safe vs Unsafe APIs per Stack): `` \$(query|execute)RawUnsafe|Prisma\.raw\(|sql\.raw\(|\b(where|orderBy|having|groupBy)Raw\(|knex\.raw\(\s*`|sequelize\.literal\(|literal_column\(|order_by\(\s*text\(|\btext\(\s*f["']|\.extra\(|RawSQL\(|FromSqlRaw\(|ExecuteSqlRaw\(|DB::raw\(|find_by_sql|multipleStatements\s*:\s*true|\$where|\$function|\$accumulator|mapReduce|JpaSort\.unsafe\(|Arel\.sql\(|createNativeQuery\(|orderBy\(\s*\$request|filter\(\s*\*\*request|['"]%s['"] ``. Also flag `Order(`, `.order(`, `.orderBy(` and `ORDER BY` whose argument comes from request input (`req.query`, `params[`, `c.Query(`, `request.args`, a DTO field), and GORM `First(&x, id)` / `Find(&x, id)` where `id` is a string (it is treated as SQL; use `First(&x, "id = ?", id)`). For MyBatis XML, `\$\{\w+\}` is string substitution; `#{}` is safe.
- Pass for the second pattern: each hit uses only compile-time constants or allowlisted identifiers and has a comment saying so. Any hit that receives request data fails.
- Also read every changed repository/DAO file in full. Queries built across several lines can escape a line-based pattern.
- If failed: replace string building with parameterized queries (`$1`, `?`, `%s` with a params tuple, or ORM equivalents), map sort and column names through an allowlist, bind lists as arrays, and escape and bind LIKE values, per `<shared>/sql-safety.md`.

## 4. All endpoints validate input

- Scope: changed route and handler files.
- Pattern for route declarations: `\b(router|app|fastify|server)\.(get|post|put|patch|delete)\(|@(Get|Post|Put|Patch|Delete)(Mapping)?\b|@\w+\.(get|post|put|patch|delete)\(|\.(GET|POST|PUT|PATCH|DELETE)\(`
- Pass: each route that reads a body, query, or path params parses it through a schema before calling the service:
  - Zod, Joi, or class-validator (`ValidationPipe`) in Node;
  - a Pydantic model parameter in FastAPI;
  - `ShouldBind*` plus `binding:` tags in Gin;
  - `@Valid` in Spring.
- An import elsewhere in the file is not enough. Check the handler itself.
- If failed: add a schema at the route boundary and parse input before calling the service.

## 5. Domain logic does not depend on framework details

- Scope: changed domain and service files.
- Patterns:
  - TS/JS: `from ["'](express|fastify|koa)["']|require\(["'](express|fastify|koa)["']\)|\bHttpException\b|@Req\(|@Res\(`
  - Python: `^\s*(from|import)\s+(fastapi|starlette|flask|django\.http)\b`
  - Go: `"github\.com/(gin-gonic/gin|labstack/echo|gofiber/fiber)`
  - Java: `org\.springframework\.web\b|@(RestController|Controller|RequestMapping)\b`
- Pass: zero hits. NestJS `@Injectable()` from `@nestjs/common` is idiomatic in services and is not a violation.
- If failed: move the framework-typed code into the transport layer. Keep domain and service code framework-agnostic.

## 6. Errors are typed and mapped centrally

- Scope: changed handler and service files.
- Pattern: `res\.status\(5\d\d\)|\bthrow new Error\(|\braise Exception\(|StatusInternalServerError|\bpanic\(`. In service files, also flag `\braise HTTPException\(|\bthrow new HttpException\(`.
- Confirm that a central mapper exists anywhere in the project. This is the one project-wide search in the checklist:
  `\(\s*err\w*\s*(:\s*\w+)?\s*,\s*req\w*.*,\s*res\w*.*,\s*next|exception_handler|@ControllerAdvice|@RestControllerAdvice|@ExceptionHandler|@Catch\(|ExceptionFilter|c\.Errors`
  The first alternative finds 4-argument Express error handlers, inline or named (`app.use(errorHandler)`).
- Pass: no hits outside the central error middleware or filter, and at least one central error-mapping module exists. It may register several handlers (one FastAPI `exception_handler` per error type, several `@Catch()` filters or `@ControllerAdvice` classes). Flag only competing ad-hoc mappers inside handlers or services.
- If failed: define typed error classes (`NotFoundError`, `ConflictError`, and so on) and a single error-mapping middleware or filter.

## 7. No suppressed type or lint errors

- Scope: all changed source files.
- Patterns:
  - TS: `:\s*any\b|\bas any\b|<any>|@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable`
  - Python: `#\s*type:\s*ignore`
  - Go: `//\s*nolint`
- Pass: zero hits, or each hit has an adjacent `allow: <reason>` comment.
- If failed: replace `any` with a precise type, or remove the suppression. Never ship a silent bypass.

## 8. Diagnostics clean

- Check: check LSP diagnostics on each changed file if the host has LSP. Otherwise run the project's type-check or build (`tsc --noEmit`, `mypy` or `pyright`, `go vet ./...`, `mvn -q compile`, or the project's own script) within `<shared>/tool-rules.md` -> Command Time Budgets. Read the script body first, per the mode=auto contract.
- Pass: zero errors in changed files. Warnings are allowed only if unrelated to the change.
- A check that timed out is "did not complete", never pass. No LSP and no type-checker is "not run" (see Exit criterion).
- If failed: fix every error the new code introduced and re-run until clean.

## 9. Test coverage on critical paths

- Check: list the business-critical functions this run added or changed (`createUser`, `placeOrder`, `charge`, `payout`, or project equivalents). Search test files for references to each one.
- Pass: every listed function has at least one test that references it and exercises an error branch.
- If failed: add at least one unit test for the happy path and one for an error branch, then run the tests (or hand off to `backend-test` for a broader suite). Follow `<shared>/tool-rules.md` -> Test Integrity: never weaken or skip a failing test to get green.

## 10. Owner predicate on tenant- and user-owned rows

- Rule: `<shared>/sql-safety.md` -> The Rules, rule 3 (a WHERE clause is not an access check) and rule 4 (writes are bounded).
- Scope: changed repository and service files that read, update or delete rows of a table with a `tenant_id`, `org_id`, `owner_id`, `user_id` or similar owner column (check `db-schema.md`).
- Pattern (case-insensitive) to list the queries to read: `\b(where|find(One|First|Unique|ById|By\w*)?|get(ById)?|update|delete|destroy|filter(_by)?)\b.*\bid\b`
- Pass: every query on an owned table binds the owner, for example `WHERE id = $1 AND tenant_id = $2`, and the owner value comes from the authenticated principal (session, verified token, request context set by auth middleware), never from the body, query string or path. UPDATE and DELETE include the key and the owner; a zero affected-row count maps to 404.
- Not a pass: a lookup by id alone with the owner compared in code afterwards, an owner taken from `req.body`, `req.query` or a path parameter, or an "admin" path that skips the owner without a role check.
- If failed: add the owner to the repository method signature and its WHERE clause, pass it from the principal in the service, and return 404 (not 403) when the row is not found for this owner unless the API design says otherwise. See `backend-auth` -> tenant-scoped authorization.

## 11. Hostile-input tests for new search, filter, sort and id parameters

- Rule: `<shared>/sql-safety.md` -> Verification, step 4. Write the tests with `backend-test` conventions (backend-test -> security tests).
- Scope: every endpoint this run added or changed that takes a search, filter, sort, id or free-text parameter.
- Check: search the test files for the endpoint's route and at least one payload from the Verification list (for example `' OR '1'='1`, `1; DROP TABLE`, `$ne`, an unknown sort column, another tenant's id).
- Pass: each such endpoint has tests that send the payloads and assert a 400 or an empty or own-tenant result, never extra rows, a 500, or a changed row count; and one test that requests another tenant's or user's id and asserts 404 or 403.
- If failed: add the tests, then run them on local targets only. A missing hostile-input test makes the verdict **incomplete**, not clean.

## 12. Security scan clean

- Rule: `<shared>/secure-coding.md` (S1-S18) and `<shared>/sql-safety.md`. This check is Verification step 1 of `secure-coding.md`.
- Scope: this run's files. Run `node <shared>/scripts/security-scan.js <file> <file> ...` with the checkpoint's created and modified files, or `node <shared>/scripts/security-scan.js --changed` when the project is a git repository and had no other uncommitted changes.
- Pass: exit 0 (no critical or high finding) and every medium finding read and either fixed or listed with a reason. A finding marked in code with `security-scan: ignore <rule-id> <reason>` must also appear in the summary with its reason.
- Not a pass: exit 1, a suppression added only to silence the scanner, or a finding "fixed" by renaming a variable or splitting a line so the pattern no longer matches.
- If Node is unavailable: run the scanner's main patterns by hand (string-built SQL, `exec`/`shell=True`, `eval`/`new Function`, `pickle`/`yaml.load`/`unserialize`, `rejectUnauthorized: false`/`verify=False`, `Math.random` for tokens, `req.body` into `create`/`update`, `fetch(req.`, a path from `req.`) and record "scanner not run" in the verdict (incomplete, not clean).
- If failed: fix per the cited rule (the scanner prints `secure-coding Sx` or `sql-safety n`).

## 13. Secure-coding review of handlers and integrations

- Rule: `<shared>/secure-coding.md`. The scanner reads one line at a time; this check reads the flow.
- Scope: changed handlers, services that call out (HTTP clients, shell, filesystem, parsers, crypto, email, templates) and webhook receivers.
- Pass, for each one: input is schema-validated and unknown fields are rejected (S1); only allowlisted fields reach the model and the response DTO hides internal fields (S2); the route is authenticated and has its role or owner check (S3); no request value reaches a shell, path, outbound URL, parser, template, regex or redirect without the containment its rule requires (S4-S10); tokens use a CSPRNG and secrets are compared in constant time (S11, S12); no secret is in code or logs (S13, S17); request size, page size and outbound timeouts are bounded (S15); a webhook verifies its signature over the raw body (S16).
- If failed: fix it now. A request value reaching a shell, file path, outbound URL, deserializer, template compiler or `eval` without its S-rule containment can never be justified, only fixed (same as the three SQL findings in the exit criterion).
