# Greenfield Generation

Use this when building a new service or module from a design (architecture, API contract, schema). If the project already has code, match its existing layout instead of these defaults.

## 1. Project Structure

Pick the structure that matches the stack. Tests live outside the source tree unless the stack's convention says otherwise (Go keeps `_test.go` next to the code).

### Node.js / Express or Fastify (TypeScript)

```
src/
├── controllers/     # Request handlers (transport only)
├── services/        # Business logic, transactions
├── repositories/    # Data access
├── models/          # ORM models / entities
├── middleware/      # Auth, validation, logging, error mapping
├── routes/          # Route registration
├── config/          # Env loading and validation
├── utils/
└── types/
tests/
├── unit/
├── integration/
└── e2e/
```

NestJS uses modules instead: `src/<feature>/{<feature>.controller.ts, <feature>.service.ts, <feature>.repository.ts, dto/}` plus a global exception filter.

### Python / FastAPI

```
app/
├── api/             # Routers
│   └── v1/
├── models/          # SQLAlchemy models
├── schemas/         # Pydantic request/response models
├── services/        # Business logic
├── repositories/    # Data access
├── core/            # Settings, logging, error handlers
└── utils/
tests/
├── unit/
├── integration/
└── e2e/
```

Django keeps its app layout (`<app>/models.py`, `views.py`, `serializers.py`, `urls.py`). Put business workflow in a `services.py` module, not in views or model `save()` overrides.

### Go / Gin

```
cmd/<app>/           # Entry point, composition root
internal/
├── handlers/        # HTTP handlers
├── services/        # Business logic
├── repositories/    # Data access
├── models/
├── middleware/
└── config/
pkg/                 # Only code meant for import by other modules
```

### Java / Spring Boot

```
src/main/java/<group>/<app>/
├── web/             # @RestController classes, request/response DTOs
├── service/         # @Service classes, @Transactional boundaries
├── repository/      # Spring Data repositories
├── domain/          # Entities and domain types
└── config/          # @Configuration, @ControllerAdvice error mapping
src/test/java/...    # Unit and @SpringBootTest / Testcontainers tests
```

## 2. What to Generate, by Layer

- **Controllers / handlers**: request parsing, schema validation, response formatting, error mapping.
- **Services / use cases**: business workflow, invariants, authorization checks, transaction boundaries for multi-write flows.
- **Repositories**: CRUD and intent-oriented queries, transaction participation, interfaces or ports where idiomatic.
- **Models**: ORM model or entity definitions, relationships, and constraints matching `db-schema.md`; seed and fixture files.
  - Do not enable or rely on ORM auto-sync (TypeORM `synchronize: true`, Sequelize `sync()`, GORM `AutoMigrate`, SQLAlchemy `metadata.create_all`, `prisma db push`, Hibernate `ddl-auto=update`) except against a disposable local database this run started. Schema reaches real databases only through `backend-migrate`.
- **Schema changes**: never written here. Hand them to `backend-migrate`, the only skill that writes and applies migration files.
- **Configuration**: an env template (`.env.example`, never a real `.env`), DB connection, logging, middleware wiring, central error mapping. Validate config at boot and fail fast.
- **Dependencies**: framework, ORM or driver, validation, testing, linting. Add DI or container libraries only when they clearly simplify the stack. Installing them always asks first, and each one passes the license gate in `SKILL.md`.

## 3. Decision Trees

### REST API
- Generate routes, validation, response formatting, error-handling middleware.
- Generate or update the OpenAPI spec only if `backend-api-design` has not produced one; otherwise implement against it.

### GraphQL
- Generate schema definitions, resolvers, DataLoaders (to avoid N+1), and subscriptions or federation config only if the design asks for them.
- Apply the depth and complexity limits from the API design.

### Database operations
- Generate ORM models, repository queries, seed scripts, and connection pooling that match `db-schema.md`.
- Hand the schema change (tables, columns, indexes, constraints) to `backend-migrate`. Do not write or apply migration files here.

### Authentication and authorization
- Implement the decisions `backend-auth` recorded (mechanism, token lifetimes, role model, password hashing). Read them from `decisions.md` and `api-patterns.md` -> Authentication.
- If no auth decision exists, stop and route to `backend-auth` first. Do not invent the auth design here.

### WebSocket / realtime
- Generate server setup, connection management, message handlers, room or channel logic, and authentication on connect.

## 4. Confirmation Summary

Present this before closing the run:

- Generated file tree
- Key files by layer
- Dependencies added (and their licenses), or the install command waiting for approval
- Schema changes handed to `backend-migrate`, if any. Applying them always asks first (see `<shared>/tool-rules.md` -> Always Ask First).
- Checklist result (clean or incomplete, with findings)
- Next steps: review, run `backend-migrate` for pending schema changes, run `backend-test`, verify layer boundaries

In `mode=interactive`, also ask whether the implementation looks correct and whether tests should be expanded by layer. In `mode=auto`, report and continue; do not ask these questions.
