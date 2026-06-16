---
name: backend-orchestrator
description: "Route backend requests to the correct backend sub-skill."
---

# Backend Orchestrator

## When to Activate

Activate this skill when the user asks for backend help without naming a specific skill, for example "build backend", "help with backend", or "create API".

## Available Sub-Skills

- `backend-scan` — Explore an existing backend project and keep memory files in sync.
- `backend-architect` — Plan backend architecture and tech stack.
- `backend-db-design` — Design database schemas and migrations.
- `backend-api-design` — Design API endpoints and contracts.
- `backend-implement` — Generate or modify backend code.
- `backend-test` — Design and generate tests.
- `backend-auth` — Design and implement authentication and authorization.
- `backend-doctor` — Run health checks and code reviews.
- `backend-ops` — Design observability, caching, async messaging, and config.
- `backend-deploy` — Set up deployment, containers, and CI/CD.
- `backend-migrate` — Plan and execute database schema evolution.

## Routing Table

| User Intent | Route To |
|-------------|----------|
| Explore, understand, scan, or sync memory | `backend-scan` |
| Design architecture or plan structure | `backend-architect` |
| Design database schema or tables | `backend-db-design` |
| Design API endpoints or routes | `backend-api-design` |
| Generate code or modify an existing backend | `backend-implement` |
| Write tests or test strategy | `backend-test` |
| Add auth, login, permissions, sessions | `backend-auth` |
| Check health, review, or audit code | `backend-doctor` |
| Logging, metrics, caching, queues, config | `backend-ops` |
| Deploy, Docker, CI/CD, infrastructure | `backend-deploy` |
| Evolve schema, migrations, backfills | `backend-migrate` |

## How to Route

Identify the intent, then activate the named skill directly using the mechanism available to you.

## Workflows

Use these multi-skill pipelines when the user request spans more than one concern. Each step lists the memory files it reads or writes.

### New Feature (Full Stack)

Use when adding a significant feature to an existing backend.

1. **`backend-scan`** (if `.opencode/everything-backend-memory/` is empty or stale)
   - Reads/writes: `project-overview.md`, `tech-stack.md`, `api-patterns.md`, `db-schema.md`, `decisions.md`, `issues.md`
2. **`backend-db-design`**
   - Reads: `tech-stack.md`, `project-overview.md`, `db-schema.md`
   - Writes: `db-schema.md`, migration files
3. **`backend-api-design`**
   - Reads: `tech-stack.md`, `project-overview.md`, `api-patterns.md`
   - Writes: `api-patterns.md`, OpenAPI/endpoint docs
4. **`backend-auth`** (only if the feature needs auth, permissions, sessions, or JWT)
   - Reads: `tech-stack.md`, `project-overview.md`, `api-patterns.md`
   - Writes: `decisions.md`
5. **`backend-implement`**
   - Reads: `tech-stack.md`, `api-patterns.md`, `db-schema.md`
   - Writes: source code, tests
6. **`backend-test`**
   - Reads: `tech-stack.md`, `api-patterns.md`
   - Writes: test files, coverage reports
7. **`backend-doctor`**
   - Reads: `tech-stack.md`, `project-overview.md`, `api-patterns.md`
   - Writes: `issues.md` (new findings)

### Quick Add Endpoint

Use when the stack is already known and only a small endpoint change is needed.

1. **`backend-api-design`**
   - Reads: `tech-stack.md`, `api-patterns.md`
   - Writes: `api-patterns.md`
2. **`backend-implement`**
   - Reads: `tech-stack.md`, `api-patterns.md`
   - Writes: source code
3. **`backend-test`**
   - Reads: `tech-stack.md`, `api-patterns.md`
   - Writes: test files

### Production Readiness

Use before launch or before declaring a service production-ready.

1. **`backend-ops`**
   - Reads: `tech-stack.md`, `project-overview.md`, `api-patterns.md`, `decisions.md`
   - Writes: observability/config code, `decisions.md`
2. **`backend-deploy`**
   - Reads: `tech-stack.md`, `project-overview.md`, `decisions.md`
   - Writes: Docker/CI/CD/infrastructure files
3. **`backend-doctor`**
   - Reads: `tech-stack.md`, `project-overview.md`, `api-patterns.md`
   - Writes: `issues.md`

### Memory Refresh

Use when memory files may be out of sync with the codebase.

1. **`backend-scan`** with `mode=sync`
   - Reads: existing `.opencode/everything-backend-memory/*.md`
   - Writes: updated `project-overview.md`, `tech-stack.md`, `api-patterns.md`, `db-schema.md`, `decisions.md`, `issues.md`
2. **`backend-doctor`**
   - Reads: refreshed memory files
   - Writes: `issues.md`

For the principles and tool rules referenced by the routed skills, see `_shared/principles.md` and `_shared/tool-rules.md`.
