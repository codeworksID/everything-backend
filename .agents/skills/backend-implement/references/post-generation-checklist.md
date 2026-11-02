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

- Scope: all changed source files.
- Pattern (case-insensitive): `` \b(select|insert|update|delete)\b.*(\$\{|["'`]\s*\+|\+\s*["'`]|["']\s+%\s*[(\w]|\.format\(|Sprintf\()|(\bf["']|Sprintf\(|\.format\().*\b(select|insert|update|delete)\b ``
- Pass: zero hits, or each hit is justified as safe:
  - tagged templates that parameterize `${}` (Prisma `$queryRaw`, `sql` tags from postgres.js or slonik);
  - interpolated identifiers taken from a fixed allowlist.
- `%s` and `?` placeholders passed with a separate params argument, as in `cur.execute(sql, params)`, are safe and do not match.
- Known false positive: a `%` inside a `LIKE` literal (for example `LIKE ' %abc'`).
- Known miss: the `%` operator pattern needs whitespace after the closing quote, so `"..."%x` without spaces is caught only by the file read below.
- Also read every changed repository file. Queries built across several lines can escape a line-based pattern.
- If failed: replace string building with parameterized queries (`$1`, `?`, `%s` with a params tuple, or ORM equivalents).

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
