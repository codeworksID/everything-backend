# everything-backend

> **Languages / Bahasa / Idiomas / 语言 / 言語:**
> [English](README.md) · [Bahasa Indonesia](README.id.md) · [Español](README.es.md) · [中文](README.zh.md) · [日本語](README.ja.md)

> **Open for contributions!** Issues, pull requests, and translations are all welcome. See the [Issues](../../issues) and [Pull Requests](../../pulls) tabs to get started.

Reusable Opencode backend skills covering project discovery, architecture, database design, API design, implementation, testing, auth, operations, deployment, migrations, visualization, health checks, and memory refresh.

## Included skills

- `backend-orchestrator` — route requests to the right backend skill
- `backend-scan` — explore an existing project and keep memory files in sync
- `backend-architect` — plan backend architecture and tech stack
- `backend-db-design` — design database schemas and migrations
- `backend-visualize` — generate beautiful Mermaid diagrams (ERD, class, actor, flowchart, sequence, architecture)
- `backend-api-design` — design API endpoints and contracts
- `backend-implement` — generate or modify backend code
- `backend-test` — design tests, fixtures, mocks, and coverage
- `backend-auth` — design and implement authentication and authorization
- `backend-ops` — logging, metrics, tracing, caching, async messaging, and config
- `backend-deploy` — containers, docker-compose, CI/CD, and health probes
- `backend-migrate` — evolve schemas, backfills, and zero-downtime migrations
- `backend-doctor` — run execution-based health checks and reviews

Shared reference files live in `.agents/skills/_shared/` and are included in the install.

## Where to start

If you are new to these skills, try them in this order:

1. **`backend-orchestrator`** — Not sure which skill fits your request? Start here and it will route you to the right one.
2. **`backend-scan`** — Point it at an existing backend repo to discover structure, stack, and conventions.
3. **`backend-architect`** — Use this when you are planning a new service or restructuring an existing one.
4. **`backend-db-design`** — Design tables, relationships, indexes, and migrations before you write code.
5. **`backend-api-design`** — Define endpoints, request/response schemas, and error contracts.
6. **`backend-implement`** — Turn designs into working code, or evolve existing code.
7. **`backend-test`** — Add tests, fixtures, mocks, and coverage next.

After the basics, pick up the specialized skills as needed:

- **`backend-auth`** — for login, signup, JWT, RBAC, and permissions.
- **`backend-ops`** — for logging, metrics, tracing, caching, and async messaging.
- **`backend-deploy`** — for Docker, CI/CD, and infrastructure setup.
- **`backend-migrate`** — for schema evolution and zero-downtime migrations.
- **`backend-doctor`** — for health checks, linting, type checks, and code review.
- **`backend-visualize`** — for ERD, architecture, and flow diagrams.

## Installation

Run the installer using `npx`:

```bash
npx everything-backend
```

The installer will run interactively and prompt you to choose:

1. **Global** — Installs the skills as a global IDE/app plugin. You will be asked which app to target:
   - **Gemini IDE** — `~/.gemini/config/plugins/everything-backend-plugin`
   - **Cursor** — `~/.cursor/skills-cursor`
   - **Opencode / generic** — `~/.agents/skills`
2. **Per-project** — Asks for your project's directory path and installs the skills locally inside `<project-path>/.agents/skills/`.

### Alternative / Manual installation

If you prefer to clone and install locally:

```bash
git clone https://github.com/codeworksID/everything-backend.git
cd everything-backend
node scripts/install.js
```

### Advanced Options

You can bypass the interactive prompts by specifying a `--target` path:

```bash
npx everything-backend --target /path/to/project/.agents/skills
```

#### Available flags

- `--dry-run` — show what would be copied without writing files
- `--force` — overwrite existing installed skills
- `--target <path>` — custom destination path (bypasses interactive prompt)

#### Examples

```bash
node scripts/install.js --dry-run
node scripts/install.js --target "C:\Users\you\Documents\GitHub\my-project\.agents\skills"
```

## What gets installed

The installer copies every folder from `.agents/skills/` into your global Opencode skills directory. Each skill is installed as:

```text
~/.agents/skills/<skill-name>/SKILL.md
```

## Usage in Opencode

After installation, the skills are available by name. Examples:

- `backend-orchestrator` — route backend requests to the right sub-skill
- `backend-scan` — inspect an existing backend codebase and keep memory current
- `backend-api-design` — design endpoints and schemas
- `backend-visualize` — draw ERDs, class diagrams, architecture diagrams, and more
- `backend-implement` — turn designs into code
- `backend-test` — add or expand tests
- `backend-auth` — add authentication and authorization
- `backend-doctor` — run a backend health check

## Development

To test the installer without touching your real global directory:

```bash
node scripts/install.js --dry-run
node scripts/install.js --target ./tmp-skills --force
```

## Repository layout

```text
.agents/skills/        Skill definitions
scripts/install.js     NPX/local installer
.opencode/             Project-local Opencode metadata
```
