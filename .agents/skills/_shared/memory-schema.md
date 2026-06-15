# Shared Memory File Schema

Backend skills use memory files in `.opencode/everything-backend-memory/` to persist project context across sessions. Each file has a defined purpose, required sections, optional sections, update rules, and an example entry.

## project-overview.md

### Purpose
Project type, purpose, module boundaries, and high-level structure.

### Required sections
- `# Project Overview` — project name and one-sentence purpose
- `## Type` — monolith / microservices / serverless / CLI / worker / etc.
- `## Structure` — key directories and their roles
- `## Last Updated` — ISO timestamp of the most recent change

### Optional sections
- `## Module Boundaries` — bounded contexts or modules and their responsibilities
- `## Entry Points` — HTTP server, CLI commands, worker entry points
- `## Notable Conventions` — naming, file organization, or project-specific rules

### Update rules
- Update when the project structure, type, or module boundaries change.
- Append timestamped discoveries; do not overwrite the entire file.
- Mark deprecated directories or modules clearly.

### Example entry
```markdown
## [2026-06-15 10:00] Initial Scan

### Type
Web API (modular monolith)

### Structure
- `src/` — source code
  - `api/` — HTTP routes and controllers
  - `services/` — business logic
  - `repositories/` — data access
  - `models/` — database models
- `tests/` — unit and integration tests

### Module Boundaries
- Users: owns registration, authentication, profiles
- Orders: owns checkout, payment capture, order history
```

## tech-stack.md

### Purpose
Languages, frameworks, databases, ORMs, auth, testing, and infrastructure choices.

### Required sections
- `# Tech Stack` — heading
- `## Languages` — primary languages and versions
- `## Frameworks` — web frameworks, worker frameworks
- `## Databases` — primary and secondary databases
- `## Testing` — test runners, assertion libraries, coverage tools
- `## Last Updated` — ISO timestamp

### Optional sections
- `## ORM / ODM` — data access libraries
- `## Auth` — authentication and authorization libraries
- `## Caching` — cache backends and client libraries
- `## Messaging` — queues, brokers, streaming
- `## Observability` — logging, metrics, tracing tools

### Update rules
- Update when dependencies, frameworks, or infrastructure change.
- Pin major versions when known.
- Mark deprecated or removed dependencies.

### Example entry
```markdown
## [2026-06-15 10:00] Initial Scan

### Languages
- Node.js 20 (TypeScript 5.4)

### Frameworks
- Fastify 4

### Databases
- PostgreSQL 16

### ORM / ODM
- Prisma 5

### Testing
- Vitest, Supertest
```

## api-patterns.md

### Purpose
API protocol, base paths, versioning, auth method, conventions, and endpoint inventory.

### Required sections
- `# API Patterns` — heading
- `## Protocol` — REST / GraphQL / gRPC / WebSocket / etc.
- `## Base Path` — e.g., `/api/v1`
- `## Authentication` — how callers authenticate
- `## Conventions` — naming, pagination, error shape, versioning
- `## Last Updated` — ISO timestamp

### Optional sections
- `## Endpoints` — resource-level endpoint list
- `## Error Codes` — project-specific error taxonomy
- `## Rate Limiting` — rules and headers
- `## Webhooks` — outgoing/incoming webhook conventions

### Update rules
- Update when endpoints, auth method, or conventions change.
- Keep the endpoint inventory append-only; mark removed endpoints deprecated.

### Example entry
```markdown
## [2026-06-15 10:00] Initial Scan

### Protocol
REST

### Base Path
/api/v1

### Authentication
JWT access token in `Authorization: Bearer <token>` header

### Conventions
- Resource names are plural nouns: `/users`, `/orders`
- Pagination: cursor-based for lists, `?cursor=` and `?limit=`
- Error shape: `{ "error": { "code": "...", "message": "..." } }`
```

## db-schema.md

### Purpose
Database type, tables/collections, key fields, relationships, indexes, and invariants.

### Required sections
- `# Database Schema` — heading
- `## Database` — database type and version
- `## Tables / Collections` — list with purpose
- `## Relationships` — entity relationships
- `## Last Updated` — ISO timestamp

### Optional sections
- `## Indexes` — notable or performance-critical indexes
- `## Invariants` — constraints, business rules enforced in schema
- `## Migrations` — migration tool and naming convention

### Update rules
- Update when tables, columns, relationships, or indexes change.
- Append schema changes with timestamps; never silently overwrite the full schema.
- Mark dropped tables/columns as deprecated.

### Example entry
```markdown
## [2026-06-15 10:00] Initial Scan

### Database
PostgreSQL 16

### Tables / Collections
- `users` — accounts and profiles
- `orders` — customer orders
- `order_items` — line items per order

### Relationships
- `users` 1:N `orders`
- `orders` 1:N `order_items`

### Indexes
- `idx_users_email` UNIQUE on `users(email)`
```

## decisions.md

### Purpose
Key architecture and design decisions with context, consequences, and status.

### Required sections
- `# Decisions` — heading
- `## [YYYY-MM-DD] [Decision Title]` — one entry per decision
  - `### Context` — what motivated the decision
  - `### Decision` — what was chosen
  - `### Consequences` — trade-offs and impact
  - `### Status` — Proposed / Accepted / Deprecated
- `## Last Updated` — ISO timestamp

### Optional sections
- `### Alternatives Considered` — options that were rejected and why

### Update rules
- Append new decisions; do not overwrite existing ones.
- Update the status of a decision when it changes.
- Mark deprecated decisions clearly and link to the replacement if applicable.

### Example entry
```markdown
## [2026-06-15 10:00] Use PostgreSQL as primary database

### Context
Project needs ACID transactions and complex relational queries.

### Decision
Use PostgreSQL 16 as the primary database.

### Consequences
- Strong consistency and rich query support
- Requires managed service or operational expertise for scaling

### Status
Accepted
```

## issues.md

### Purpose
Known issues, TODOs, technical debt, and risks discovered during scans or reviews.

### Required sections
- `# Issues` — heading
- `## [YYYY-MM-DD] [Issue Title]` — one entry per issue
  - `### Severity` — Critical / High / Medium / Low
  - `### Description` — what the issue is
  - `### Location` — file paths or modules
  - `### Status` — Open / In Progress / Resolved
- `## Last Updated` — ISO timestamp

### Optional sections
- `### Recommendation` — suggested fix or mitigation
- `### Owner` — who is responsible

### Update rules
- Append new issues; do not overwrite resolved ones.
- Update status and add resolution notes when an issue is fixed.
- Mark false positives or stale items clearly.

### Example entry
```markdown
## [2026-06-15 10:00] Missing input validation on user registration

### Severity
High

### Description
The registration endpoint does not validate email format or password length before processing.

### Location
`src/routes/auth.ts:42`

### Status
Open

### Recommendation
Add Zod schema validation and return 422 for invalid input.
```

## General Update Format

When updating any memory file, use a timestamped block:

```markdown
## [YYYY-MM-DD HH:MM] [Reason]

### Added/Updated
- [What changed]
- Source: [File path or context]
```

Preserve existing content. Mark deprecated items with `[DEPRECATED]` and keep them until explicitly removed.
