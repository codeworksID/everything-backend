# everything-backend

Reusable Opencode backend skills covering project discovery, architecture, database design, API design, implementation, testing, auth, operations, deployment, migrations, health checks, and memory refresh.

## Included skills

- `backend-orchestrator` — route requests to the right backend skill
- `backend-scan` — explore an existing project and keep memory files in sync
- `backend-architect` — plan backend architecture and tech stack
- `backend-db-design` — design database schemas and migrations
- `backend-api-design` — design API endpoints and contracts
- `backend-implement` — generate or modify backend code
- `backend-test` — design tests, fixtures, mocks, and coverage
- `backend-auth` — design and implement authentication and authorization
- `backend-ops` — logging, metrics, tracing, caching, async messaging, and config
- `backend-deploy` — containers, docker-compose, CI/CD, and health probes
- `backend-migrate` — evolve schemas, backfills, and zero-downtime migrations
- `backend-doctor` — run execution-based health checks and reviews

Shared reference files live in `.agents/skills/_shared/` and are included in the install.

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

#### Available flags:
- `--dry-run` — show what would be copied without writing files
- `--force` — overwrite existing installed skills
- `--target <path>` — custom destination path (bypasses interactive prompt)

#### Examples:
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
