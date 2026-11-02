---
name: backend-implement
description: "Turn backend designs into code or evolve existing code. Supports Node.js, Python, Go, and Java. Reads from memory files for full context. Activate when the user says 'implement', 'generate code', 'build this', or wants to add, split, or refactor backend code."
---

# Backend Implement

## When to Activate

- User wants to generate code from a design
- User says "implement", "generate code", "build this"
- After architecture and API design are complete
- User asks "how do I build this?" or "how do I add X?"
- Adding a new endpoint, field, service, middleware, or repository query to existing code
- Splitting a fat controller, service, or repository

## Prerequisites

See `_shared/context-loading.md` for standard prerequisites (project root check, manifest detection, memory file presence, fallback rules, and context priority list).

Add these implementation-specific prerequisites:

- REQUIRED: `tech-stack.md` exists or the tech stack can be inferred from project files.
  - If missing: run `backend-scan` with `mode=auto` to populate memory
- RECOMMENDED: `api-patterns.md` and `db-schema.md` are available for the feature being implemented.
  - If missing: run `backend-api-design` and/or `backend-db-design` to produce the missing design, or proceed with the existing design context the user provides

## Required Context

See `_shared/context-loading.md` for the standard context priority list and loading rules.

Implementation-specific overrides:

- Always load: `tech-stack.md`, `api-patterns.md`, `db-schema.md`, `project-overview.md`
- Lazy-load: `decisions.md` only when the implementation raises architecture or cross-cutting design questions

## Core Process

### Step 1: Context Loading

Read all memory files for full context:

- `project-overview.md` - Project type, structure
- `tech-stack.md` - Languages, frameworks, databases
- `api-patterns.md` - API design, endpoints
- `db-schema.md` - Database schema
- `decisions.md` - Architecture decisions

If memory is empty or stale, suggest running:
- `backend-scan` first
- `backend-architect` for architecture
- `backend-api-design` for endpoints
- `backend-db-design` for schema

### Step 2: Implementation Rules (MANDATORY)

Apply the code/architecture, API, system, and security principles in `_shared/principles.md` before writing or editing code.

### Post-Generation Checklist

After generating or modifying code, run each check below against this run's files.

**Scope**
- Scan only the files this run created or changed: the checkpoint's `created_files[]` and `modified_files[]` (see `_shared/tool-rules.md` → Concurrent & Partial Work). Without a checkpoint, use the paths whose `git status --porcelain` entry is new or whose content differs from the run-start snapshot, plus any `pre_existing_changes[]` file this run edited.
- Map layers from `project-overview.md`, or from the layouts under Greenfield Generation (Node `src/`, FastAPI `app/`, Go `internal/`). Never assume `src/`.
- Run each pattern with the host's `grep` tool (regex, case-insensitive where noted) restricted to the scoped files via `glob` or an explicit file list. Use shell `grep -rnE` or PowerShell `Select-String -Pattern` only when the host has no search tool.

**Reporting**
- Each check reports: files scanned (count), findings as `file:line`, and a verdict.
- No matches is a valid result, not a tool error.
- Report a check as "not applicable" when this run changed no files in its layer, and as "not run" when its path does not exist or the tool failed. Never report either as pass.
- A hit is a candidate. Read the line before changing code.
- The checklist is clean when every applicable check ran and every finding is either fixed or listed in the summary with `file:line` and a one-line justification.

#### 1. Controllers contain no business logic
- Scope: changed transport files (`controllers/`, `handlers/`, `routes/`, `api/`).
- Pattern: `\b(if|else|switch|case|for|while|match|select)\b`
- Pass: every hit is input validation, auth/error-to-HTTP mapping, or response shaping.
- If failed: move the business branch into a service method; the handler should only parse input, call `service.<action>(dto)`, and map the result/error.

#### 2. Services own transaction boundaries
- Scope: changed transport files.
- Pattern (case-insensitive): `\b(begin|commit|rollback)\b|transaction|@Transactional|\bBeginTx?\(|\batomic\(`
- Pass: zero hits in transport files.
- If failed: open the transaction in the service method; controllers must never start or commit transactions.

#### 3. No SQL built from strings
- Scope: all changed source files.
- Pattern (case-insensitive): `` \b(select|insert|update|delete)\b.*(\$\{|["'`]\s*\+|\+\s*["'`]|["']\s+%\s*[(\w]|\.format\(|Sprintf\()|(\bf["']|Sprintf\(|\.format\().*\b(select|insert|update|delete)\b ``
- Pass: zero hits, or each hit is justified as safe: tagged templates that parameterize `${}` (Prisma `$queryRaw`, `sql` tags from postgres.js/slonik), or interpolated identifiers taken from a fixed allowlist. `%s` and `?` placeholders passed with a separate params argument, as in `cur.execute(sql, params)`, are safe and do not match. A `%` inside a `LIKE` literal (e.g. `LIKE ' %abc'`) is a known false positive. The `%` operator pattern needs whitespace after the closing quote, so `"..."%x` written without spaces is caught only by the file read below.
- Also read every changed repository file. Queries built across several lines can escape a line-based pattern.
- If failed: replace string building with parameterized queries (`$1`, `?`, `%s` with a params tuple, or ORM equivalents).

#### 4. All endpoints validate input
- Scope: changed route/handler files.
- Pattern for route declarations: `\b(router|app|fastify|server)\.(get|post|put|patch|delete)\(|@(Get|Post|Put|Patch|Delete)(Mapping)?\b|@\w+\.(get|post|put|patch|delete)\(|\.(GET|POST|PUT|PATCH|DELETE)\(`
- Pass: each route that reads a body, query, or path params parses it through a schema before calling the service: Zod/Joi/class-validator (`ValidationPipe`), a Pydantic model parameter (FastAPI), `ShouldBind*` plus `binding:` tags (Gin), or `@Valid` (Spring). An import elsewhere in the file is not enough; check the handler itself.
- If failed: add a schema at the route boundary and parse input before calling the service.

#### 5. Domain logic does not depend on framework details
- Scope: changed domain and service files.
- Patterns:
  - TS/JS: `from ["'](express|fastify|koa)["']|require\(["'](express|fastify|koa)["']\)|\bHttpException\b|@Req\(|@Res\(`
  - Python: `^\s*(from|import)\s+(fastapi|starlette|flask|django\.http)\b`
  - Go: `"github\.com/(gin-gonic/gin|labstack/echo|gofiber/fiber)`
  - Java: `org\.springframework\.web\b|@(RestController|Controller|RequestMapping)\b`
- Pass: zero hits. NestJS `@Injectable()` from `@nestjs/common` is idiomatic in services and is not a violation.
- If failed: move the framework-typed code into the transport layer; keep domain and service code framework-agnostic.

#### 6. Errors are typed and mapped centrally
- Scope: changed handler and service files.
- Pattern: `res\.status\(5\d\d\)|\bthrow new Error\(|\braise Exception\(|StatusInternalServerError|\bpanic\(`. In service files, also flag `\braise HTTPException\(|\bthrow new HttpException\(`.
- Confirm that a central mapper exists anywhere in the project (the one project-wide lookup in this checklist): `\(\s*err\w*\s*(:\s*\w+)?\s*,\s*req\w*.*,\s*res\w*.*,\s*next|exception_handler|@ControllerAdvice|@RestControllerAdvice|@ExceptionHandler|@Catch\(|ExceptionFilter|c\.Errors`. The first alternative finds 4-argument Express error handlers, inline or named (`app.use(errorHandler)`).
- Pass: no hits outside the central error middleware/filter, and at least one central error-mapping module exists. It may register several handlers (one FastAPI `exception_handler` per error type, several `@Catch()` filters or `@ControllerAdvice` classes). Flag only competing ad-hoc mappers inside handlers or services.
- If failed: define typed error classes (`NotFoundError`, `ConflictError`, etc.) and a single error-mapping middleware/filter.

#### 7. No suppressed type or lint errors
- Scope: all changed source files.
- Patterns: TS `:\s*any\b|\bas any\b|<any>|@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable`; Python `#\s*type:\s*ignore`; Go `//\s*nolint`
- Pass: zero hits, or each hit has an adjacent `allow: <reason>` comment.
- If failed: replace `any` with a precise type, or remove the suppression; never ship a silent bypass.

#### 8. Diagnostics clean
- Check: run `lsp_diagnostics` on each changed file. If LSP is unavailable, run the project's type-check (`tsc --noEmit`, `mypy`/`pyright`, `go vet ./...`, or the build) within the limits in `_shared/tool-rules.md` → Command Time Budgets.
- Pass: zero errors in changed files; warnings allowed only if unrelated to the change. A check that timed out is reported as "did not complete", never as pass.
- If failed: fix every error introduced by the new code and re-run until clean.

#### 9. Test coverage on critical paths
- Check: list the business-critical functions this run added or changed (`createUser`, `placeOrder`, `charge`, `payout`, or project-specific equivalents), then use `glob`/`grep` to find test files that reference each one.
- Pass: every listed function has at least one test that references it and exercises an error branch.
- If failed: add at least one unit test covering the happy path and one covering an error branch; then run `backend-test`.

### Step 3: Tool Usage Rules (MANDATORY)

Use OpenCode tools during implementation.

See `_shared/tool-rules.md` for the canonical tool-usage rules.

## Greenfield Generation

Use this workflow when building from a design.

### 1. Project Structure

Choose the structure that matches the stack.

#### Node.js/Express Structure
```
src/
├── controllers/     # Request handlers
├── services/        # Business logic
├── repositories/    # Data access
├── models/          # Database models
├── middleware/      # Express middleware
├── routes/          # API routes
├── utils/           # Utility functions
├── config/          # Configuration
└── types/           # TypeScript types
tests/
├── unit/
├── integration/
└── e2e/
```

#### Python/FastAPI Structure
```
app/
├── api/             # API routes
│   └── v1/          # Version 1
├── models/          # SQLAlchemy models
├── schemas/         # Pydantic schemas
├── services/        # Business logic
├── repositories/    # Data access
├── core/            # Configuration
└── utils/           # Utilities
tests/
├── unit/
├── integration/
└── e2e/
```

#### Go/Gin Structure
```
internal/
├── handlers/        # HTTP handlers
├── services/        # Business logic
├── repositories/    # Data access
├── models/          # Database models
├── middleware/      # Gin middleware
└── config/          # Configuration
pkg/                 # Public packages
cmd/                 # Entry points
tests/
```

### 2. What to Generate

By layer:

- **Controllers/handlers**: request parsing, schema validation, response formatting, error mapping
- **Services/use cases**: business workflow, invariants, authorization, transaction boundaries for multi-write flows
- **Repositories**: CRUD and intent-oriented queries, transaction participation, interfaces/ports where idiomatic
- **Models**: ORM model/entity definitions, relationships, and constraints matching `db-schema.md`; seed and fixture files. Do not enable or rely on ORM auto-sync (TypeORM `synchronize: true`, Sequelize `sync()`, GORM `AutoMigrate`, SQLAlchemy `metadata.create_all`, `prisma db push`) except against a disposable local DB this run started; schema reaches real databases only through `backend-migrate`
- **Schema changes**: never written here. Hand them to `backend-migrate`, which is the only skill that writes and applies migration files
- **Configuration**: env templates, DB connection, logging, middleware wiring, central error mapping
- **Dependencies**: framework, ORM/driver, validation, testing, linting, and DI/container libraries only when they meaningfully simplify the stack

### 3. Decision Trees

#### REST API
- Generate routes, validation, response formatting, error handling middleware, OpenAPI spec

#### GraphQL
- Generate schema definitions, resolvers, data loaders, subscriptions, federation config if needed

#### Database operations
- Generate ORM models, seed scripts, query builders, connection pooling, constraints matching `db-schema.md`
- Hand the schema change (tables, columns, indexes, constraints) to `backend-migrate`; do not write or apply migration files here

#### Authentication
- Generate auth middleware, JWT handling, password hashing, RBAC, session management

#### WebSocket
- Generate server setup, connection management, message handlers, room/channel logic, auth

### 4. User Confirmation

Present an implementation summary:

- Generated file tree
- Key files by layer
- Dependencies added
- Schema changes handed to `backend-migrate` (if any). Applying them always asks first; see `_shared/tool-rules.md` → Always Ask First
- Next steps: review, run `backend-migrate` for pending schema changes, run, test, verify layer boundaries

Ask:
- "Does this implementation look correct?"
- "Any changes needed?"
- "Should I generate or expand tests by layer?"
- "Should I save progress to memory?"

## Modifying Existing Code

Most backend work is evolution, not greenfield. Use these workflows.

### Workflow: Add a New Endpoint to an Existing Controller

1. Read the existing controller, service, repository, and route files
2. Reuse the existing request/response schema style and error mapping
3. Add the route entry before implementing the handler
4. Add the handler as thin transport: parse input, call service, map output/error
5. Add the service method for the business workflow; place transactions if the flow writes to multiple stores
6. Add or extend repository methods as intent-oriented queries
7. Add unit tests for the service and endpoint/contract tests for the route
8. Run `lsp_diagnostics` and existing tests before finishing

### Workflow: Add a New Column/Field to an Existing Model

1. Check `db-schema.md` and existing model/entity definitions
2. Add the field to the model, schema/serializer, and any DTO used across layers
3. Hand the schema change to `backend-migrate` with the column spec (type, nullability, default, index, foreign key) from `db-schema.md`. Do not write or apply the migration here; `backend-migrate` owns zero-downtime checks, and applying always follows `_shared/tool-rules.md` → Always Ask First
4. If `backend-migrate` plans expand/contract or a backfill, keep the code working against both the old and new schema until the contract step (e.g. treat the new field as nullable until the backfill completes)
5. Update repository queries that select, filter, or order by the new field
6. Update service invariants that depend on the field
7. Update request/response schemas and validation rules
8. Add integration tests for repository behavior against the migrated schema; migration correctness is verified by `backend-migrate`
9. Update seed data and fixture files if they break; running seeds against a database follows Always Ask First

### Workflow: Split a Fat Controller or Service

1. Identify responsibilities: transport mapping, business workflow, persistence, external calls
2. Extract a new service/use case for one cohesive workflow at a time
3. Move business rules, invariants, and transaction ownership into the new service
4. Leave the controller/handler as thin transport glue
5. Extract repository concerns into intent-oriented repository methods
6. Update composition root or dependency wiring to inject the new service
7. Add tests for the extracted service before removing logic from the old one
8. Delete or deprecate the old methods once callers are migrated

### Workflow: Add Middleware to an Existing Pipeline

1. Read the current middleware stack and registration order
2. Decide where the new middleware belongs: auth, validation, logging, rate limiting, error recovery, correlation IDs
3. Implement the middleware as a focused unit with no business branching beyond its scope
4. Register it in the framework pipeline in the correct order
5. Add endpoint/contract tests that exercise the new behavior
6. Verify existing routes still pass with `lsp_diagnostics` and the test suite

### Workflow: Refactor a Repository Query

1. Read the current query, indexes, and callers
2. Preserve the existing repository interface/signature unless the change is intentional
3. Optimize or simplify the query while keeping it persistence-only
4. Run integration tests against the real database or a close test double
5. Check query plans or execution if the database supports it
6. Update callers only if the return shape changes
7. Never move business decisions into the repository; keep them in services

## Pattern Reference

### Minimal Controller Pattern (Express)
```typescript
// Express 5 forwards rejected promises from async handlers to the error middleware.
// Express 4 does not: keep the try/catch + next(err), or wrap the handler.
// Arrow-function class field keeps `this` bound for `router.post('/', controller.createUser)`.
createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = CreateUserSchema.parse(req.body);   // ZodError -> 400 in the error middleware
    const user = await this.userService.createUser(dto);
    res.status(201).json({ data: toUserResponse(user) });
  } catch (err) {
    next(err);
  }
};

// Response DTO: explicit fields only, never password_hash or other secrets
function toUserResponse(u: User): UserResponse {
  return { id: u.id, email: u.email, displayName: u.displayName, createdAt: u.createdAt };
}
```

### Minimal Router Pattern (FastAPI)
```python
# UserOut omits password_hash; with Pydantic v2 set model_config = ConfigDict(from_attributes=True)
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=UserOut)
async def create_user(
    data: UserCreate,
    svc: Annotated[UserService, Depends(get_user_service)],
):
    # The service uses an async driver (SQLAlchemy AsyncSession, asyncpg), so await it.
    # With a sync service, declare the endpoint with plain `def` so FastAPI runs it in a threadpool;
    # never call blocking DB I/O inside `async def`.
    return await svc.create_user(data)
```

### Minimal Handler Pattern (Go/Gin)
```go
func (h *UserHandler) CreateUser(c *gin.Context) {
    var dto CreateUserDto
    if err := c.ShouldBindJSON(&dto); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
        return // without return the handler keeps running and writes a second response
    }
    user, err := h.svc.CreateUser(c.Request.Context(), dto)
    if err != nil {
        _ = c.Error(err) // error middleware maps ErrEmailTaken -> 409, unknown -> 500
        return
    }
    c.JSON(http.StatusCreated, toUserResponse(user))
}
```

### Minimal Service Pattern
```typescript
async createUser(dto: CreateUserDto): Promise<User> {
  const passwordHash = await this.passwordHasher.hash(dto.password); // argon2id (or bcrypt)
  try {
    // Map explicit fields; never persist the raw DTO
    return await this.repo.create({
      email: normalizeEmail(dto.email),
      displayName: dto.displayName,
      passwordHash,
    });
  } catch (err) {
    // Rely on the unique constraint on email; no check-then-insert (it races).
    // Unique violation: Postgres SQLSTATE 23505, MySQL error 1062, Prisma P2002.
    // Match the specific constraint (pg `err.constraint`, Prisma `err.meta.target`),
    // so another unique column does not surface as an email conflict.
    if (isUniqueViolation(err, 'users_email_key')) throw new ConflictError('Email already registered'); // -> 409
    throw err;
  }
}
```

- Never pass a request DTO straight to the repository; map the fields the entity needs.
- Hash passwords in the service before persisting (argon2id or bcrypt, see `backend-auth`).
- Enforce uniqueness with a database unique constraint and map the unique-violation error to 409. A prior `findBy...` check is optional UX, not the guarantee. On Postgres a unique violation aborts the surrounding transaction, so when this runs inside a wider transaction use a savepoint or `INSERT ... ON CONFLICT DO NOTHING` and check the affected row count.
- Return a response DTO with explicit fields; never serialize the entity directly.

### Layering Rules

- Controllers/handlers: transport only, no business branching beyond response mapping
- Services/use cases: business workflow, invariants, authorization, transaction ownership
- Repositories: persistence only, no transport or domain orchestration
- External adapters: email, queues, storage, HTTP clients behind interfaces/ports
- Composition root: assemble concrete implementations and inject dependencies

### Transaction Rules

- Open transactions in the application/service layer, not in controllers
- Repositories may participate in a transaction but should not decide cross-repository workflow
- Keep transactions short and side-effect free
- External side effects (email, webhooks, queues) happen after commit or through an outbox pattern

### Testing Matrix

#### Unit Tests
- Service/use-case invariants
- Error branches and authorization failures
- Domain calculations and state transitions

#### Integration Tests
- Repository behavior against the real database (with the migrated schema) or a close test double; migration correctness itself is tested by `backend-migrate`
- Unique-constraint violations mapped to 409
- Transaction rollback behavior

#### Endpoint / Contract Tests
- Request validation
- Response shape and error mapping
- Authentication/authorization behavior

## Concurrent & Partial Work

See `_shared/tool-rules.md` (Concurrent & Partial Work) for checkpoint, resume, rollback, and multi-feature isolation rules.

**Implement-specific caveat:** when resuming from a checkpoint, run `lsp_diagnostics` on all `created_files[]` and `modified_files[]` before continuing. Previously clean code may have drifted while the checkpoint was inactive.

## Edge Cases

- **No design exists**: Run `backend-architect` and `backend-api-design` first
- **Memory is stale**: Run `backend-scan`
- **Feature needs a schema change**: Hand it to `backend-migrate`; never write or apply migrations from this skill
- **Complex business logic**: Break into smaller services, use domain modeling
- **Legacy code**: Prefer the strangler pattern; wrap and replace incrementally
- **Multiple languages**: Ask user which to prioritize
- **Large project**: Change incrementally, confirm each layer before the next
- **Existing tests**: Match existing test patterns and frameworks
- **Fat controller temptation**: Move rules into services/use cases before adding more endpoints
- **Repository doing too much**: Split query concerns from business workflow and inject collaborators
