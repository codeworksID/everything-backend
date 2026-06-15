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

For the principles and tool rules referenced by the routed skills, see `_shared/principles.md` and `_shared/tool-rules.md`.
