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
- `backend-visualize` — Generate Mermaid diagrams (ERD, class, actor, flowchart, sequence, architecture).
- `backend-refactor` — Behavior-preserving refactoring: split fat controllers/services, extract modules, reduce coupling, dependency inversion, strangler-fig, modernize legacy.

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
| Refactor, split, extract, reduce coupling, modernize legacy (behavior-preserving) | `backend-refactor` |
| Visualize database, draw ERD, create class diagram, diagram schema, architecture diagram | `backend-visualize` |

## How to Route

Identify the intent, then activate the named skill directly using the mechanism available to you.

## Workflows

Use these multi-skill pipelines when the user request spans more than one concern. Each step lists the memory files it reads or writes.

### New Feature (Full Stack)

Use when adding a significant feature to an existing backend.

1. **`backend-scan`** (if `.opencode/everything-backend-memory/` is empty or stale)
   - Reads/writes: `project-overview.md`, `tech-stack.md`, `api-patterns.md`, `db-schema.md`, `decisions.md`, `issues.md`
   - Branching: If scan cannot locate or read the project → escalate to user with the specific path/permission error. If memory files exist but are partially stale → re-run with `mode=sync` instead of full scan.
2. **`backend-db-design`**
   - Reads: `tech-stack.md`, `project-overview.md`, `db-schema.md`
   - Writes: `db-schema.md`, migration files
   - Branching: If the feature requires a schema change discovered mid-design → re-run from step 2 with the new requirement. If the schema design conflicts with existing tables → escalate to user.
3. **`backend-api-design`**
   - Reads: `tech-stack.md`, `project-overview.md`, `api-patterns.md`
   - Writes: `api-patterns.md`, OpenAPI/endpoint docs
   - Branching: If API design needs a schema that was not defined in step 2 → loop back to step 2 (`backend-db-design`). If existing API patterns conflict with the new design → escalate to user.
4. **`backend-auth`** (only if the feature needs auth, permissions, sessions, or JWT)
   - Reads: `tech-stack.md`, `project-overview.md`, `api-patterns.md`
   - Writes: `decisions.md`
   - Branching: If auth design reveals an API contract change → loop back to step 3 (`backend-api-design`). If auth conflicts with project-overview constraints → escalate to user.
5. **`backend-implement`**
   - Reads: `tech-stack.md`, `api-patterns.md`, `db-schema.md`
   - Writes: source code, tests
   - Branching: If implementation uncovers a missing schema field or relationship → loop back to step 2 (`backend-db-design`), then step 3 (`backend-api-design`), then resume. If a design flaw is found → loop back to the relevant design step with the specific gap noted. If a schema change is requested after implementation has started → loop back to `backend-db-design`, then `backend-migrate`, then resume step 5.
6. **`backend-test`**
   - Reads: `tech-stack.md`, `api-patterns.md`
   - Writes: test files, coverage reports
   - Branching: If tests fail on the implementation (not on test bugs) → re-run from step 5 (`backend-implement`) with the failing test details. If coverage is below the project target → re-run from step 6 with additional tests.
7. **`backend-doctor`**
   - Reads: `tech-stack.md`, `project-overview.md`, `api-patterns.md`
   - Writes: `issues.md` (new findings)
   - Branching: If Critical findings → STOP. Fix issues, re-run from step 5. If High findings → present to user; continue only after acknowledgment. If Medium/Low → note in issues.md and complete the workflow.
   - Completion criteria: All Critical and High findings resolved (or explicitly accepted by the user), Medium/Low findings logged to `issues.md`, and the feature is ready for review or merge.

### Quick Add Endpoint

Use when the stack is already known and only a small endpoint change is needed.

1. **`backend-api-design`**
   - Reads: `tech-stack.md`, `api-patterns.md`
   - Writes: `api-patterns.md`
   - Branching: If the endpoint requires schema changes not in `db-schema.md` → escalate to user; do not silently expand scope. If existing API patterns conflict with the new endpoint → escalate to user.
2. **`backend-implement`**
   - Reads: `tech-stack.md`, `api-patterns.md`
   - Writes: source code
   - Branching: If implementation reveals the API design is incomplete → loop back to step 1 with the specific gap. If a schema change is requested after implementation has started → loop back to `backend-db-design`, then `backend-migrate`, then resume step 2.
3. **`backend-test`**
   - Reads: `tech-stack.md`, `api-patterns.md`
   - Writes: test files
   - Branching: If tests fail on the implementation (not on test bugs) → re-run from step 2 (`backend-implement`) with the failing test details. If coverage is below the project target → re-run from step 3 with additional tests.
   - Completion criteria: All tests pass, coverage meets the project target, and the endpoint behaves as specified in the API design.

### Production Readiness

Use before launch or before declaring a service production-ready.

1. **`backend-ops`**
   - Reads: `tech-stack.md`, `project-overview.md`, `api-patterns.md`, `decisions.md`
   - Writes: observability/config code, `decisions.md`
   - Branching: If observability/caching/config design uncovers a missing API contract → loop back to `backend-api-design` with the specific gap. If conflicts with existing project-overview constraints → escalate to user.
2. **`backend-deploy`**
   - Reads: `tech-stack.md`, `project-overview.md`, `decisions.md`
   - Writes: Docker/CI/CD/infrastructure files
   - Branching: If deployment setup requires an environment change not in `decisions.md` → loop back to step 1 (`backend-ops`) to record the decision first. If CI/CD health checks fail on a real run → re-run from step 2 with the failure log.
3. **`backend-doctor`**
   - Reads: `tech-stack.md`, `project-overview.md`, `api-patterns.md`
   - Writes: `issues.md`
   - Branching: If Critical findings → STOP. Fix issues, re-run from step 5. If High findings → present to user; continue only after acknowledgment. If Medium/Low → note in issues.md and complete the workflow.
   - Completion criteria: All Critical and High findings resolved (or explicitly accepted by the user), Medium/Low findings logged to `issues.md`, and the service is deemed production-ready by the user.

### Memory Refresh

Use when memory files may be out of sync with the codebase.

1. **`backend-scan`** with `mode=sync`
   - Reads: existing `.opencode/everything-backend-memory/*.md`
   - Writes: updated `project-overview.md`, `tech-stack.md`, `api-patterns.md`, `db-schema.md`, `decisions.md`, `issues.md`
   - Branching: If sync cannot locate the project or memory directory → escalate to user with the specific path error. If a memory file is corrupt or unreadable → escalate to user; do not silently drop it.
2. **`backend-doctor`**
   - Reads: refreshed memory files
   - Writes: `issues.md`
   - Branching: If Critical findings → STOP. Fix issues, re-run from step 5. If High findings → present to user; continue only after acknowledgment. If Medium/Low → note in issues.md and complete the workflow.
   - Completion criteria: All memory files reflect the current codebase, all Critical and High findings resolved (or explicitly accepted by the user), and Medium/Low findings are logged to `issues.md`.

## Branching & Failure Rules

These rules apply generically across all four workflows. Individual steps may add workflow-specific branches, but the baseline is:

- Critical findings: STOP. Re-run from the step that can fix them.
- High findings: pause for user decision (redesign vs patch).
- Medium/Low findings: log to `issues.md` and continue.
- A design flaw discovered mid-implementation → loop back to the design step (`backend-api-design` or `backend-db-design`) with the specific gap noted.
- A schema change requested after `backend-implement` has started → loop back to `backend-db-design`, then `backend-migrate`, then resume `backend-implement`.

For the principles and tool rules referenced by the routed skills, see `_shared/principles.md` and `_shared/tool-rules.md`.
