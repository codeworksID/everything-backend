# everything-backend

> **Languages / Bahasa / Idiomas / 语言 / 言語:**
> [English](README.md) · [Bahasa Indonesia](README.id.md) · [Español](README.es.md) · [中文](README.zh.md) · [日本語](README.ja.md)

> **Open for contributions!** Issues, pull requests, and translations are all welcome. See the [Issues](../../issues) and [Pull Requests](../../pulls) tabs to get started.
>
> [![GitHub issues](https://img.shields.io/github/issues/codeworksID/everything-backend)](../../issues) [![good first issue](https://img.shields.io/github/issues/codeworksID/everything-backend/good%20first%20issue?color=7057ff&label=good%20first%20issue)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) [![help wanted](https://img.shields.io/github/issues/codeworksID/everything-backend/help%20wanted?color=008672&label=help%20wanted)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22)

Reusable Opencode backend skills covering project discovery, architecture, database design, API design, implementation, testing, auth, operations, deployment, migrations, visualization, health checks, and memory refresh.

## Included skills

- `backend-orchestrator` — route requests to the right backend skill
- `backend-scan` — explore an existing project and keep memory files in sync
- `backend-architect` — plan backend architecture and tech stack
- `backend-db-design` — design database schemas and migration plans
- `backend-visualize` — generate beautiful Mermaid diagrams (ERD, class, actor, flowchart, sequence, architecture)
- `backend-api-design` — design API endpoints and contracts
- `backend-implement` — generate or modify backend code
- `backend-refactor` — behavior-preserving refactoring: split fat controllers/services, extract modules, reduce coupling, strangler fig, modernize legacy
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
4. **`backend-db-design`** — Design tables, relationships, indexes, and a migration plan before you write code (`backend-migrate` writes and applies the migration files).
5. **`backend-api-design`** — Define endpoints, request/response schemas, and error contracts.
6. **`backend-implement`** — Turn designs into working code, or evolve existing code.
7. **`backend-test`** — Add tests, fixtures, mocks, and coverage next.

After the basics, pick up the specialized skills as needed:

- **`backend-auth`** — for login, signup, JWT, RBAC, and permissions.
- **`backend-ops`** — for logging, metrics, tracing, caching, and async messaging.
- **`backend-deploy`** — for Docker, CI/CD, and infrastructure setup.
- **`backend-migrate`** — for schema evolution and zero-downtime migrations.
- **`backend-refactor`** — for splitting fat controllers and services, extracting modules, reducing coupling, and modernizing legacy code without changing behavior.
- **`backend-doctor`** — for health checks, linting, type checks, and code review.
- **`backend-visualize`** — for ERD, architecture, and flow diagrams.

## Installation

Run the installer using `npx`:

```bash
npx everything-backend
```

The installer will run interactively and prompt you to choose:

1. **Global** — Installs the skills as a global IDE/app plugin. You will be asked which app to target:
   - **Antigravity (Gemini IDE)** — `~/.gemini/config/plugins/everything-backend-plugin`
   - **Cursor** — `~/.cursor/skills`
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

The installer copies every skill folder from `.agents/skills/` plus the shared `_shared/` folder into the target you choose. Skills look for `_shared/` next to their own folder, so the two always stay together.

| Target | Skills installed as | Extra files |
|---|---|---|
| Antigravity (Gemini IDE) | `~/.gemini/config/plugins/everything-backend-plugin/skills/<skill-name>/SKILL.md` | `plugin.json` (name, version) |
| Cursor | `~/.cursor/skills/<skill-name>/SKILL.md` | — |
| Opencode / generic | `~/.agents/skills/<skill-name>/SKILL.md` | — |
| Per-project | `<project-path>/.agents/skills/<skill-name>/SKILL.md` | — |
| `--target <path>` | `<path>/<skill-name>/SKILL.md` | — |

`_shared/` lands beside the skill folders in every case (for example `~/.agents/skills/_shared/`). Skill folders that already exist are skipped unless you pass `--force`.

## Usage in Opencode

After installation, the skills are available by name. Examples:

- `backend-orchestrator` — route backend requests to the right sub-skill
- `backend-scan` — inspect an existing backend codebase and keep memory current
- `backend-api-design` — design endpoints and schemas
- `backend-visualize` — draw ERDs, class diagrams, architecture diagrams, and more
- `backend-implement` — turn designs into code
- `backend-refactor` — restructure existing code without changing behavior
- `backend-test` — add or expand tests
- `backend-auth` — add authentication and authorization
- `backend-doctor` — run a backend health check

## What the skills do in your project

- **Memory files**: skills write project memory (overview, tech stack, decisions, open issues) to `.opencode/everything-backend-memory/` in your project, and run checkpoints and patches to `.opencode/everything-backend-memory/.checkpoints/`. Add `.opencode/everything-backend-memory/.checkpoints/` to `.gitignore` (or the whole memory folder if you do not want to commit memory).
- **Auto mode is the default**: the agent reads code and runs local, hermetic commands (lint, type-check, build, unit tests, read-only dependency audits) without asking.
- **It always asks first** before applying migrations or changing a database; git commits, branch switches, resets, cleans, stashes, rebases, merges, or pushes; deleting or overwriting files it did not create; installing, upgrading, or removing dependencies; deploys, image pushes, IaC apply, secret rotation, or paid external API calls; editing CI/CD or secret files; and running tests or the app against any database, queue, or service that is not provably local. It never skips or weakens a failing test to make it pass.
- **Interactive mode**: say "ask me before each step" to approve every step yourself.

## Development

To test the installer without touching your real global directory:

```bash
node scripts/install.js --dry-run --target ./tmp-skills
node scripts/install.js --target ./tmp-skills --force
rm -rf ./tmp-skills   # remove the scratch install; do not commit it
npm run check
```

`npm run check` (also run on `prepublishOnly`) verifies that the `bin` and `files` paths exist, every skill has valid frontmatter, every skill is listed in this README and in `backend-orchestrator`, and every referenced `_shared/` file exists.

## Repository layout

```text
.agents/skills/            Skill definitions (one folder per skill)
.agents/skills/_shared/    Shared reference docs used by every skill
scripts/install.js         NPX/local installer
scripts/check-package.js   Package and skill consistency check (npm run check)
docs/                      Audit reports
.github/                   Issue and pull request templates
```

`.opencode/` is not part of this repository: the skills create `.opencode/everything-backend-memory/` inside your project at runtime.
