---
name: backend-scan
description: "Scan a backend project to learn its current state and keep memory files in sync. Use this skill when the user says 'explore', 'understand', 'what's here', 'scan', 'refresh memory', 'update memory', or 'sync memory'. Operates in mode=initial for first discovery or mode=sync for drift detection."
---

# Backend Scan

Two-in-one skill for understanding a backend codebase and keeping that understanding up to date.

## When to Activate

- User wants to explore or understand an existing backend project
- User starts work on an unfamiliar codebase
- User says "explore", "understand", "what's here", "scan", "analyze this project"
- User says "refresh memory", "update memory", "sync memory"
- After major code changes or periodically to keep memory current

## Process

Set `mode=initial` for the first scan of a project (creates memory files). Set `mode=sync` to detect drift from existing memory files and update them.

### Step 0: Tool Usage Rules

Use OpenCode tools directly during every scan.

See `_shared/tool-rules.md` for the canonical tool-usage rules.

### Step 1: Scan Project State

In both modes, start by scanning the project:

- Detect language/package manager:
  - **Node.js**: `package.json`, `tsconfig.json`, `yarn.lock`, `pnpm-lock.yaml`
  - **Python**: `requirements.txt`, `pyproject.toml`, `Pipfile`, `setup.py`
  - **Go**: `go.mod`, `go.sum`
  - **Java**: `pom.xml`, `build.gradle`, `build.gradle.kts`
  - **Rust**: `Cargo.toml`
  - **Ruby**: `Gemfile`
- Map directory structure:
  - `src/`, `lib/`, `app/`, `internal/`, `cmd/`
  - `controllers/`, `handlers/`, `routes/`, `api/`
  - `models/`, `entities/`, `schemas/`
  - `services/`, `repositories/`, `daos/`
  - `middleware/`, `guards/`, `interceptors/`
  - `config/`, `settings/`, `utils/`, `helpers/`
- Detect frameworks, databases, ORMs/ODMs, auth, cache, queues, search, testing
- Identify architecture patterns: MVC, Clean Architecture, Hexagonal, Layered
- Note principle-level concerns (see `_shared/principles.md` for details):
  - **Database**: normalization, referential integrity, indexes, transaction boundaries
  - **Code/Architecture**: SOLID, DRY, separation of concerns, dependency injection, loose coupling
  - **API**: REST conventions, idempotency, versioning, validation, error handling, auth/authz, pagination, rate limiting
  - **System**: scalability, caching, queues, observability, event-driven/CQRS patterns
  - **Security**: least privilege, input sanitization, secure defaults, audit logging, encryption

### Step 2: Mode Split

#### mode=initial

If no memory files exist, treat this as first discovery:

1. Create memory files in `.opencode/everything-backend-memory/`:
   - `project-overview.md` — project type, purpose, structure
   - `tech-stack.md` — languages, frameworks, databases, ORMs, auth, testing
   - `api-patterns.md` — API protocol, auth method, conventions
   - `db-schema.md` — database type, tables/collections discovered
   - `decisions.md` — key architecture decisions (if any are obvious)
   - `issues.md` — known issues and TODOs (if found)
2. Preserve any existing content by appending rather than overwriting.
3. Present a discovery summary to the user and ask for confirmation.

#### mode=sync

If memory files already exist, treat this as drift detection:

1. Read current memory files in `.opencode/everything-backend-memory/`:
   - `project-overview.md`, `tech-stack.md`, `api-patterns.md`, `db-schema.md`, `decisions.md`, `issues.md`
2. Compare the live project state against memory.
3. Classify changes:
   - **New** routes/models/dependencies/configs → add to memory
   - **Modified** routes/schema/dependencies/configs → update memory
   - **Deleted** items → mark as deprecated in memory; do not remove without confirmation
4. Generate a change summary and ask the user for confirmation before applying updates.
5. After approval, update affected files with timestamped entries and refresh "Last Updated" timestamps.

### Step 3: Update Memory Files

Memory files live in `.opencode/everything-backend-memory/`:

- `project-overview.md` — type, purpose, structure
- `tech-stack.md` — languages, frameworks, databases, ORMs, auth, testing
- `api-patterns.md` — API protocol, auth, conventions
- `db-schema.md` — database type, tables/collections
- `decisions.md` — architecture decisions
- `issues.md` — known issues and TODOs

See `_shared/memory-schema.md` for the canonical schema of each memory file, including required sections, optional sections, update rules, and example entries.

Update rules:

- Preserve existing content.
- Append new discoveries with timestamps.
- Mark deprecated items clearly.
- Update the "Last Updated" timestamp.

Update entry format:

```markdown
## [YYYY-MM-DD HH:MM] [Initial Scan | Sync Update]

### Added/Updated
- [What changed]
- Source: [File path]
```

## Decision Trees

### If `package.json` found
- Check `dependencies` for: `express`, `fastify`, `@nestjs/core`, `koa`
- Check `devDependencies` for: `typescript`, `jest`, `eslint`
- Check `scripts` for: `start`, `dev`, `build`, `test`
- Read `tsconfig.json` for TypeScript configuration

### If `requirements.txt` or `pyproject.toml` found
- Check for: `django`, `fastapi`, `flask`
- Check for: `sqlalchemy`, `alembic`, `psycopg2`
- Check for: `pytest`, `unittest`
- Look for `manage.py` (Django) or `main.py` (FastAPI)

### If `go.mod` found
- Check for: `gin-gonic/gin`, `labstack/echo`, `gofiber/fiber`
- Check for: `gorm.io/gorm`, `jmoiron/sqlx`
- Check for: `stretchr/testify`
- Look for `cmd/` directory for entry points

### If `pom.xml` or `build.gradle` found
- Check for: `spring-boot-starter-web`, `quarkus`
- Check for: `hibernate`, `spring-data-jpa`
- Check for: `junit`, `testng`
- Look for `src/main/java` and `src/test/java`

## Templates

### Discovery Summary (mode=initial)

```markdown
# Project Discovery Summary

## Project Type
[Web API / Microservice / Monolith / CLI / Worker]

## Tech Stack
- **Language**: [Detected]
- **Framework**: [Detected]
- **Database**: [Detected]
- **ORM**: [Detected]

## Architecture
[Pattern detected]

## Key Findings
- [Important observation 1]
- [Important observation 2]

## Memory Updated
- ✅ project-overview.md
- ✅ tech-stack.md
- ✅ api-patterns.md
- ✅ db-schema.md
```

### Change Summary (mode=sync)

```markdown
# Memory Sync Summary

**Date**: [ISO timestamp]
**Project**: [Project name]

## Changes Detected

### Added
- [NEW] file1.ts → [Description]

### Modified
- [MODIFIED] schema.prisma → [What changed]

### Deleted
- [DELETED] old-route.ts → [What was removed]

## Updates to Apply
- `api-patterns.md`: [List]
- `db-schema.md`: [List]
- `tech-stack.md`: [List]
- `project-overview.md`: [List]

## Conflicts
- [None / List conflicts]

## Recommended Action
[Update all / Update specific files / Resolve conflicts first]
```

## Edge Cases

- **No package manager files found**: Ask the user about the tech stack directly.
- **Multiple languages detected**: Focus on the backend language and note others.
- **Monorepo structure**: Identify the specific backend directory.
- **No clear architecture**: Note as "undetermined" and ask the user.
- **Memory files already exist in mode=initial**: Append new findings; do not overwrite.
- **No memory files exist in mode=sync**: Suggest running a fresh `mode=initial` scan.
- **Large codebase**: Focus on key directories (`src/`, `app/`, `cmd/`).
- **Generated code present**: Note which files are generated.
- **Conflicting changes detected**: Present conflicts to the user; do not auto-resolve.
- **No changes detected**: Report "Memory is up to date".
- **Deleted memory items**: Mark as deprecated; do not remove without confirmation.
