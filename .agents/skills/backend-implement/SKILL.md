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

Before generating or modifying code, confirm the following machine-checkable conditions:

- REQUIRED: Project root is confirmed and accessible.
  - Check: `bash -c 'test -d src || test -d app || test -d internal || test -d lib'`
  - If missing: stop and ask the user for the correct project path
- REQUIRED: `tech-stack.md` exists or the tech stack can be inferred from project files.
  - Check: `glob .opencode/everything-backend-memory/tech-stack.md`; if empty, fall back to `bash -c 'ls package.json pyproject.toml go.mod pom.xml build.gradle 2>/dev/null | head -1'`
  - If missing: stop and ask the user for the project path that contains a known manifest, or run `backend-scan` to populate memory
- RECOMMENDED: `api-patterns.md` and `db-schema.md` are available for the feature being implemented.
  - Check: `glob .opencode/everything-backend-memory/api-patterns.md` and `glob .opencode/everything-backend-memory/db-schema.md`
  - If missing: run `backend-api-design` and/or `backend-db-design` to produce the missing design, or proceed with the existing design context the user provides

If any REQUIRED Check fails, run `backend-scan` with `mode=auto`, then re-run these checks. If the missing file is a project file (e.g., manifest, source dir) that `backend-scan` cannot create, stop and ask the user.

## Required Context

Read memory files in this priority order:

1. `tech-stack.md` — languages, frameworks, databases
2. `api-patterns.md` — API design, endpoints
3. `db-schema.md` — database schema
4. `project-overview.md` — project type, structure
5. `decisions.md` — architecture decisions (skip unless architecture questions arise)

Only load `decisions.md` when the implementation raises architecture or cross-cutting design questions.

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

After generating or modifying code, run each check below. A run is "clean" only when every Check command exits 0 and every Pass condition holds.

#### 1. Controllers contain no business logic
- Check: `grep -nE "if|switch|for|while" src/controllers/ src/handlers/ 2>/dev/null | grep -v "validate\|parse\|format\|map\|next()"`
- Pass condition: no output, OR output is limited to input validation and response shaping.
- If failed: move the business branch into a service method; controller should only call `service.<action>(dto)` and map the result/error.

#### 2. Services own transaction boundaries
- Check: `grep -nE "BEGIN|COMMIT|ROLLBACK|transaction" src/services/ -r 2>/dev/null`
- Pass condition: transaction markers appear in service files, never in controllers.
- If failed: open the transaction in the service method; controllers must never start or commit transactions.

#### 3. No raw SQL concatenation
- Check: `grep -nE "SELECT|INSERT|UPDATE|DELETE" src/ -r 2>/dev/null | grep -E "\\$\\{|\\%s|\\+.*['\"]"`
- Pass condition: zero matches.
- If failed: replace string interpolation with parameterized queries (`$1`, `?`, or ORM equivalents).

#### 4. All endpoints have validation schemas
- Check: `grep -nE "router\.(get|post|put|patch|delete)|@(Get|Post|Put|Patch|Delete)|app\.(get|post|put|patch|delete)" src/ -r 2>/dev/null`
  For each matched line, also `grep -nE "zod|joi|yup|pydantic|class-validator|validate" <file>`.
- Pass condition: every route line has a validation reference in the same file or an imported schema.
- If failed: add a Zod/Joi/Pydantic schema at the route boundary and parse input before calling the service.

#### 5. Domain logic does not depend on framework details
- Check: `grep -nE "import .* from ['\"](express|fastify|@nestjs|koa|gin|spring)|@Controller|@RestController|@RequestMapping" src/domain/ src/services/ 2>/dev/null`
- Pass condition: zero matches.
- If failed: move the framework-typed code into an application/transport layer; keep `src/domain/` and `src/services/` framework-agnostic.

#### 6. Errors are typed and mapped centrally
- Check: `grep -nE "res\.status\(5\)|raise Exception\(|throw new Error\(['\"]" src/ -r 2>/dev/null`
  Then `grep -nE "errorHandler|error_mapper|exception_filter|@ControllerAdvice" src/`
- Pass condition: raw 500s and untyped `throw new Error(...)` only appear in framework-level error middleware, not in handlers/services.
- If failed: define typed error classes (`NotFoundError`, `ConflictError`, etc.) and a single error-mapping middleware/filter.

#### 7. No suppressed type errors
- Check: `grep -nE ": any\b|@ts-ignore|@ts-expect-error|as any\b" src/ -r 2>/dev/null`
- Pass condition: zero matches (TypeScript projects) OR only documented and justified cases (with an adjacent `// allow:` comment).
- If failed: replace `any` with a precise type, or remove the suppression; never ship a silent bypass.

#### 8. LSP diagnostics clean
- Check: run `lsp_diagnostics` on the changed source directory.
- Pass condition: zero errors; warnings allowed only if unrelated to the change.
- If failed: fix every error introduced by the new code; re-run `lsp_diagnostics` until clean.

#### 9. Test coverage on critical paths
- Check: `bash -c 'cd src && grep -lE "createUser|placeOrder|charge|payout" -r . | xargs -I {} grep -lE "describe|test|it" {}.test.* 2>/dev/null'`
- Pass condition: every business-critical function has at least one test file referencing it.
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
- **Models/migrations**: schema definitions, relationships, constraints, migrations, seed data
- **Configuration**: env templates, DB connection, logging, middleware wiring, central error mapping
- **Dependencies**: framework, ORM/driver, validation, testing, linting, and DI/container libraries only when they meaningfully simplify the stack

### 3. Decision Trees

#### REST API
- Generate routes, validation, response formatting, error handling middleware, OpenAPI spec

#### GraphQL
- Generate schema definitions, resolvers, data loaders, subscriptions, federation config if needed

#### Database operations
- Generate ORM models, migrations, seed scripts, query builders, connection pooling, constraints matching `db-schema.md`

#### Authentication
- Generate auth middleware, JWT handling, password hashing, RBAC, session management

#### WebSocket
- Generate server setup, connection management, message handlers, room/channel logic, auth

### 4. User Confirmation

Present an implementation summary:

- Generated file tree
- Key files by layer
- Dependencies added
- Next steps: review, migrate, run, test, verify layer boundaries

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
3. Add the migration that matches the database decision (default, nullable, index, foreign key, etc.)
4. Update repository queries that select, filter, or order by the new field
5. Update service invariants that depend on the field
6. Update request/response schemas and validation rules
7. Add integration tests for repository behavior and migration correctness
8. Update seed data and fixtures if they break

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
async createUser(req, res, next) {
  const dto = CreateUserSchema.parse(req.body);
  const user = await this.userService.createUser(dto);
  res.status(201).json({ data: user });
}
```

### Minimal Router Pattern (FastAPI)
```python
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    svc: UserService = Depends(get_user_service)
):
    return svc.create_user(data)
```

### Minimal Handler Pattern (Go/Gin)
```go
func (h *UserHandler) CreateUser(c *gin.Context) {
    var dto CreateUserDto
    if err := c.ShouldBindJSON(&dto); err != nil { /* 400 */ }
    user, err := h.svc.CreateUser(c.Request.Context(), dto)
    // map err to HTTP, otherwise 201
}
```

### Minimal Service Pattern
```typescript
async createUser(dto: CreateUserDto): Promise<User> {
  const existing = await this.repo.findByEmail(dto.email);
  if (existing) throw new ConflictError('Email already registered');
  return this.repo.create(dto);
}
```

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
- Repository behavior against the real database or a close test double
- Migration correctness for new schema changes
- Transaction rollback behavior

#### Endpoint / Contract Tests
- Request validation
- Response shape and error mapping
- Authentication/authorization behavior

## Concurrent & Partial Work

This skill participates in the shared checkpoint contract defined in `_shared/tool-rules.md` (Concurrent & Partial Work).

### Checkpoint
- File: `.opencode/everything-backend-memory/.checkpoints/backend-implement-<ISO-timestamp>.json`
- Required fields:
  - `feature_slug`: user-provided or auto-derived identifier for the change set (e.g., `user-registration`, `order-cancel`).
  - `started_at`: ISO-8601 timestamp.
  - `completed_steps`: array of step names already finished.
  - `pending_steps`: array of step names still to run.
  - `generated_files`: array of file paths this run created or modified.
  - `memory_updates`: array of memory files this run appended to.

### Resume
1. On start, run `glob .opencode/everything-backend-memory/.checkpoints/backend-implement-*.json`.
2. If a checkpoint exists, ask the user: "Resume from `<pending_steps[0]>` or start over?"
   - In `mode=auto`, default to "resume" unless the checkpoint is older than 24 hours, in which case start over (and move the old checkpoint to `.checkpoints/archive/`).
3. If resuming, re-load the checkpoint and skip `completed_steps`.
4. When resuming from a checkpoint, the skill MUST re-validate generated code with `lsp_diagnostics` before continuing; previously clean files may have drifted.

### Rollback
1. Read the checkpoint's `generated_files` list.
2. For each file, present `git checkout -- <file>` as the rollback command. Never run destructive deletions automatically.
3. After the user confirms, run the listed `git checkout` commands and delete the checkpoint file.
4. If a file was added (not just modified), suggest `git rm` or `rm` for the user to run, but do not execute it.

### Multi-feature isolation
- Every run MUST set a `feature_slug` before any write operation. If the user did not provide one, derive it from the first relevant file or ask.
- Two concurrent runs of this skill with different `feature_slugs` must run in isolation — they do not share checkpoints or generated file lists.
- Two concurrent runs with the SAME `feature_slug` are a collision: refuse to start and tell the user to either wait or pick a different slug.

### Partial completion
- If the run stops after some `generated_files` have been written but before all `pending_steps` finish, the checkpoint must still be saved.
- On the next invocation, the resume step above applies. The user can pick which `pending_steps` to redo or skip.

## Edge Cases

- **No design exists**: Run `backend-architect` and `backend-api-design` first
- **Memory is stale**: Run `backend-scan`
- **Complex business logic**: Break into smaller services, use domain modeling
- **Legacy code**: Prefer the strangler pattern; wrap and replace incrementally
- **Multiple languages**: Ask user which to prioritize
- **Large project**: Change incrementally, confirm each layer before the next
- **Existing tests**: Match existing test patterns and frameworks
- **Fat controller temptation**: Move rules into services/use cases before adding more endpoints
- **Repository doing too much**: Split query concerns from business workflow and inject collaborators
