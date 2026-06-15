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
