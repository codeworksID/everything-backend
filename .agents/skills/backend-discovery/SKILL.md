---
name: backend-discovery
description: "Explore and understand existing backend projects. Reads project structure, identifies tech stack, analyzes code patterns, and updates memory files. Use this skill when starting work on an existing project, understanding unfamiliar codebases, or when the user says 'explore', 'understand', 'what's here'."
---

# Backend Discovery

## When to Activate

- User wants to understand an existing backend project
- User starts new backend work on an existing codebase
- User says "explore", "understand", "what's here", "analyze this project"
- Before making changes to an unfamiliar codebase
- When project memory is stale or missing

## Discovery Process

### Step 0.5: Tool Usage Rules (MANDATORY)

Use OpenCode tools directly during discovery:

1. **`glob`** for file discovery and structure mapping
2. **`read`** for manifests, configs, README files, and representative source files
3. **`grep`** for framework imports, route declarations, auth patterns, ORM usage, and queue/cache integrations
4. **`ast_grep_search`** for structural searches such as controllers, handlers, services, and repositories
5. **`lsp_symbols`, `lsp_find_references`, and `lsp_goto_definition`** when supported to trace definitions and boundaries
6. **`task` with `subagent_type="explore"`** for parallel repository search and **`subagent_type="librarian"`** when an external dependency or framework must be understood

### Step 0.6: What to Identify

Discovery should explicitly surface whether the codebase follows these principles or where it deviates:

- **Database**: normalization level, referential integrity, ACID-sensitive flows, index strategy, consistency/denormalization choices
- **Code/Architecture**: SOLID, DRY, KISS, YAGNI, separation of concerns, dependency injection patterns, loose coupling, cohesion
- **API**: REST conventions, idempotency, versioning, validation, error handling, auth/authz, pagination, rate limiting
- **System**: scalability, reliability, availability, caching, queues, observability, event-driven patterns, CQRS usage
- **Security**: least privilege, defense in depth, input sanitization, secure defaults, audit logging, encryption practices

### Step 1: Project Structure Scan

Use glob to identify the project type:

- **Node.js**: `package.json`, `tsconfig.json`, `yarn.lock`, `pnpm-lock.yaml`
- **Python**: `requirements.txt`, `pyproject.toml`, `Pipfile`, `setup.py`
- **Go**: `go.mod`, `go.sum`
- **Java**: `pom.xml`, `build.gradle`, `build.gradle.kts`
- **Rust**: `Cargo.toml`
- **Ruby**: `Gemfile`

Map the directory structure:
- `src/`, `lib/`, `app/`, `internal/`, `cmd/`
- `controllers/`, `handlers/`, `routes/`, `api/`
- `models/`, `entities/`, `schemas/`
- `services/`, `repositories/`, `daos/`
- `middleware/`, `guards/`, `interceptors/`
- `utils/`, `helpers/`, `common/`
- `config/`, `settings/`

### Step 2: Tech Stack Identification

**Framework Detection**:
- **Node.js**: Express, Fastify, NestJS, Koa, Hapi
- **Python**: Django, FastAPI, Flask, Pyramid
- **Go**: Gin, Echo, Fiber, Chi, net/http
- **Java**: Spring Boot, Quarkus, Micronaut

**Database Detection**:
- **SQL**: PostgreSQL, MySQL, SQLite, SQL Server
- **NoSQL**: MongoDB, DynamoDB, Cassandra
- **Cache**: Redis, Memcached
- **Search**: Elasticsearch, Meilisearch

**ORM/ODM Detection**:
- **Node.js**: Prisma, TypeORM, Sequelize, Mongoose
- **Python**: SQLAlchemy, Django ORM, Tortoise ORM
- **Go**: GORM, sqlx, ent
- **Java**: Hibernate, JPA, MyBatis

**Auth Detection**:
- JWT (jsonwebtoken, PyJWT)
- OAuth (passport, oauthlib)
- Session-based (express-session, Flask-Login)
- API Keys (custom headers)

### Step 3: Code Pattern Analysis

**API Patterns**:
- REST: Look for `router.get()`, `@app.get()`, `http.GET()`
- GraphQL: Look for `gql`, `apollo`, `resolvers`
- gRPC: Look for `.proto` files
- WebSocket: Look for `ws`, `socket.io`

**Architecture Patterns**:
- **MVC**: Models, Views, Controllers separation
- **Clean Architecture**: Domain, Application, Infrastructure, Interface layers
- **Hexagonal**: Ports and Adapters
- **Layered**: Presentation, Business, Data layers

**Error Handling**:
- try/catch blocks
- Result/Either types
- Middleware-based error handling
- Global error handlers

**Testing**:
- **Unit**: Jest, pytest, Go testing, JUnit
- **Integration**: Supertest, TestClient, dockertest
- **E2E**: Cypress, Playwright, Selenium

### Step 4: Memory Update

Update files in `.opencode/everything-backend-memory/`:

- **project-overview.md**: Add project type, purpose, structure
- **tech-stack.md**: Add detected languages, frameworks, databases, ORMs
- **api-patterns.md**: Add API protocol, auth method, rate limiting
- **db-schema.md**: Add database type, tables/collections discovered

Always preserve existing content and append new discoveries with timestamps.

### Step 5: User Confirmation

After discovery, present a summary:

```markdown
# Project Discovery Summary

## Project Type
[What kind of project this is]

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

Then ask:
- "Is this understanding correct?"
- "Anything I missed?"
- "Should I update memory with these findings?"

## Decision Trees

### If `package.json` found:
- Check `dependencies` for: `express`, `fastify`, `@nestjs/core`, `koa`
- Check `devDependencies` for: `typescript`, `jest`, `eslint`
- Check `scripts` for: `start`, `dev`, `build`, `test`
- Read `tsconfig.json` for TypeScript configuration

### If `requirements.txt` or `pyproject.toml` found:
- Check for: `django`, `fastapi`, `flask`
- Check for: `sqlalchemy`, `alembic`, `psycopg2`
- Check for: `pytest`, `unittest`
- Look for `manage.py` (Django) or `main.py` (FastAPI)

### If `go.mod` found:
- Check for: `gin-gonic/gin`, `labstack/echo`, `gofiber/fiber`
- Check for: `gorm.io/gorm`, `jmoiron/sqlx`
- Check for: `stretchr/testify`
- Look for `cmd/` directory for entry points

### If `pom.xml` or `build.gradle` found:
- Check for: `spring-boot-starter-web`, `quarkus`
- Check for: `hibernate`, `spring-data-jpa`
- Check for: `junit`, `testng`
- Look for `src/main/java` and `src/test/java`

## Templates

### Project Overview Template
```markdown
# Project Overview

## Type
[Web API / Microservice / Monolith / CLI / Worker]

## Purpose
[What this project does in 1-2 sentences]

## Tech Stack
- Language: [Detected]
- Framework: [Detected]
- Database: [Detected]

## Structure
[MVC / Clean Architecture / Hexagonal / Layered]

## Last Updated
[ISO timestamp]
```

### Tech Stack Template
```markdown
# Tech Stack

## Language
[Node.js v20 / Python 3.11 / Go 1.21 / Java 17]

## Framework
[Express 4.x / FastAPI 0.100 / Gin 1.9 / Spring Boot 3.x]

## Database
[PostgreSQL 15 / MySQL 8 / MongoDB 6 / Redis 7]

## ORM
[Prisma / SQLAlchemy / GORM / Hibernate]

## Auth
[JWT / OAuth 2.0 / Session / API Key]

## Testing
[Jest / pytest / Go testing / JUnit]

## Last Updated
[ISO timestamp]
```

## Edge Cases

- **No package manager files found**: Ask user about the tech stack directly
- **Multiple languages detected**: Focus on the backend language, note others
- **Monorepo structure**: Identify the specific backend directory
- **No clear architecture**: Note as "undetermined" and ask user
- **Memory files already exist**: Append new findings, don't overwrite
- **Large codebase**: Focus on key directories (`src/`, `app/`, `cmd/`)
- **Generated code present**: Note which files are generated
