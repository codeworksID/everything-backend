# everything-backend

> **Languages / Bahasa / Idiomas / 语言 / 言語:**
> [English](README.md) · [Bahasa Indonesia](README.id.md) · [Español](README.es.md) · [中文](README.zh.md) · [日本語](README.ja.md)

> **Open for contributions!** Issues, pull requests, and translations are all welcome. See the [Issues](../../issues) and [Pull Requests](../../pulls) tabs to get started.
>
> [![GitHub issues](https://img.shields.io/github/issues/codeworksID/everything-backend)](../../issues) [![good first issue](https://img.shields.io/github/issues/codeworksID/everything-backend/good%20first%20issue?color=7057ff&label=good%20first%20issue)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) [![help wanted](https://img.shields.io/github/issues/codeworksID/everything-backend/help%20wanted?color=008672&label=help%20wanted)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22)

Backend engineering skills for AI coding agents: project discovery, architecture, database design, migrations, API design, auth, implementation, refactoring, testing, debugging, security review, health checks, operations, deployment, and diagrams. They work in **Claude Code**, **Claude.ai**, **OpenCode / OMO**, **Cursor**, and **Antigravity**.

## Included skills

- `backend-orchestrator`: routes requests to the right backend skill and runs multi-step workflows
- `backend-scan`: explores an existing project and keeps memory files in sync
- `backend-architect`: plans architecture and tech stack, and writes `docs/architecture/overview.md` and ADRs
- `backend-db-design`: designs database schemas and migration plans
- `backend-visualize`: generates themed Mermaid diagrams (ERD, class, actor, flowchart, sequence, architecture)
- `backend-api-design`: designs API endpoints and contracts
- `backend-implement`: builds new features and evolves existing code
- `backend-refactor`: behavior-preserving refactoring, such as splitting fat controllers or services, extracting modules, reducing coupling, strangler fig, and modernizing legacy code
- `backend-debug`: fixes bugs by reproducing the bug, writing a failing test, finding the root cause, making a minimal fix, and adding a regression test
- `backend-test`: designs tests, fixtures, mocks, and coverage
- `backend-auth`: designs and implements authentication and authorization
- `backend-security`: security review covering threat modeling, the OWASP API Top 10, secret scanning, SAST, and supply chain checks
- `backend-ops`: logging, metrics, tracing, caching, async messaging, config, resilience patterns, and backup/restore/DR
- `backend-deploy`: containers, CI/CD, Kubernetes, release strategy, rollback, and gated migration steps
- `backend-migrate`: schema evolution, backfills, and zero-downtime (expand/contract) migrations
- `backend-doctor`: execution-based health checks and diff-scoped reviews

Shared material lives in `.agents/skills/_shared/`:

- the rules every skill follows (`tool-rules.md`, `context-loading.md`, `memory-schema.md`, `principles.md`)
- a tool-name map for each host (`host-tools.md`)
- stack references (`stacks/postgres.md`, `stacks/node-typescript.md`, `stacks/python-fastapi.md`)
- the enforcement scripts (`scripts/checkpoint.js`, `scripts/guard.js`)

Each skill keeps a short `SKILL.md` and loads its detailed templates and checklists from its own `references/` folder only when it needs them.

## Where to start

1. **`backend-orchestrator`**: start here if you're not sure which skill fits your request. It routes you to the right one.
2. **`backend-scan`**: point it at an existing backend repo to discover its structure, stack, and conventions.
3. **`backend-architect`**: use it when planning a new service or restructuring an existing one.
4. **`backend-db-design`**, then **`backend-migrate`**: design the schema first, then write and apply migrations safely.
5. **`backend-api-design`**, then **`backend-implement`**, then **`backend-test`**: define the contract, build it, and test it.

Then use the specialized skills as needed:

- **`backend-debug`** when something is broken.
- **`backend-security`** before a launch.
- **`backend-auth`** for login and permissions.
- **`backend-ops`** for operating in production.
- **`backend-deploy`** for shipping.
- **`backend-refactor`** for cleanup without changing behavior.
- **`backend-doctor`** for health checks.
- **`backend-visualize`** for diagrams.

## Installation

### Claude Code (recommended: plugin with guard hook)

Inside Claude Code:

```text
/plugin marketplace add codeworksID/everything-backend
/plugin install everything-backend@codeworks
```

The plugin installs all skills plus a `PreToolUse` guard hook. The hook makes Claude ask before it runs any of these:

- destructive git commands (`reset --hard`, `clean -f`, `checkout -- <path>`, force push)
- migration apply, reset, or drop commands
- destructive SQL
- deploy and infra commands (`kubectl apply`, `helm upgrade`, `terraform apply`, `docker push`)
- recursive deletes
- edits to secret files (`.env`, keys)

To control the hook:

- Set `EVERYTHING_BACKEND_GUARD=off` to disable it.
- Set `EVERYTHING_BACKEND_GUARD=strict` to also ask before commits, pushes, and dependency installs.

You can also install the skills as plain Claude Code skills, without the hook:

```bash
npx everything-backend --host claude
```

That copies them to `~/.claude/skills`. For a single project, run `npx everything-backend`, choose **Per-project**, and pick the `.claude/skills` layout.

### Claude.ai

Build one self-contained zip per skill (each zip bundles its own copy of `_shared/`):

```bash
git clone https://github.com/codeworksID/everything-backend.git
cd everything-backend
npm run build:claude
```

Then upload each `dist/claude-skills/<skill>.zip` under **Settings > Capabilities > Skills**. Code execution must be enabled for the scripts to run.

### OpenCode, Cursor, Antigravity

```bash
npx everything-backend
```

The installer asks you to choose:

1. **Global**: installs for one app.
   - **Claude Code**: `~/.claude/skills`
   - **Antigravity (Gemini IDE)**: `~/.gemini/config/plugins/everything-backend-plugin`
   - **Cursor**: `~/.cursor/skills`
   - **OpenCode / generic**: `~/.agents/skills`
2. **Per-project**: asks for your project path and a layout. The layout is either `<project>/.agents/skills/` (OpenCode, Cursor, generic) or `<project>/.claude/skills/` (Claude Code).

To enforce the "ask first" rules on OpenCode, see the `opencode.json` permission snippet in `_shared/host-tools.md`.

### Manual installation

```bash
git clone https://github.com/codeworksID/everything-backend.git
cd everything-backend
node scripts/install.js
```

#### Flags

- `--host <claude|antigravity|cursor|opencode>`: global install for one host, with no prompts
- `--target <path>`: custom destination; it bypasses the prompts and overrides `--host`
- `--dry-run`: shows what would be copied without writing files
- `--force`: overwrites skills that are already installed

```bash
node scripts/install.js --dry-run --host claude
node scripts/install.js --target "C:\Users\you\Documents\GitHub\my-project\.claude\skills"
```

## What gets installed

The installer copies every skill folder from `.agents/skills/` plus the shared `_shared/` folder into the target. Skills look for `_shared/` inside their own folder first, then next to it, so the folders must stay together.

| Target | Skills installed as | Extra files |
|---|---|---|
| Claude Code plugin | managed by `/plugin` | guard hook (`hooks/hooks.json`) |
| Claude Code skills | `~/.claude/skills/<skill-name>/SKILL.md` | none |
| Claude.ai | one uploaded zip per skill, with `_shared/` inside | none |
| Antigravity (Gemini IDE) | `~/.gemini/config/plugins/everything-backend-plugin/skills/<skill-name>/SKILL.md` | `plugin.json` (name, version) |
| Cursor | `~/.cursor/skills/<skill-name>/SKILL.md` | none |
| OpenCode / generic | `~/.agents/skills/<skill-name>/SKILL.md` | none |
| Per-project | `<project>/.agents/skills/` or `<project>/.claude/skills/` | none |
| `--target <path>` | `<path>/<skill-name>/SKILL.md` | none |

The installer skips skill folders that already exist unless you pass `--force`.

## What the skills do in your project

- **Memory files.** The skills write project memory (overview, tech stack, decisions, open issues, test strategy, deployment plan) to `.opencode/everything-backend-memory/`. The folder keeps that name on every host, for compatibility. Checkpoints and patches go to `.opencode/everything-backend-memory/.checkpoints/`. Add the `.checkpoints/` folder to `.gitignore`, or the whole memory folder if you don't want to commit memory.
- **Deliverables.** Some skills write documents into your project:
  - architecture docs and ADRs (`docs/architecture/`, `docs/adr/`)
  - security reviews (`docs/security/`)
  - runbooks (`docs/runbooks/`)
- **Checkpoints and undo.** Skills that edit code record each run with `_shared/scripts/checkpoint.js`. You can undo a run by reverse-applying its own patch. The rollback never uses `git checkout --`, `reset --hard`, or `clean`, so your own edits survive.
- **Auto mode is the default.** The agent reads code and runs local, hermetic commands without asking. That covers lint, type-check, build, unit tests, and read-only dependency audits.
- **It always asks first** before any of these:
  - applying migrations or changing a database
  - git commits, branch switches, resets, cleans, stashes, rebases, merges, or pushes
  - deleting or overwriting files it didn't create
  - installing, upgrading, or removing dependencies
  - deploys, image pushes, IaC apply, secret rotation, or paid external API calls
  - editing CI/CD or secret files
  - running tests or the app against any database, queue, or service that isn't provably local
- **It never skips or weakens a failing test** to make it pass.
- **Interactive mode.** Say "ask me before each step" to approve every step yourself.

## Development

```bash
npm run check          # package, frontmatter, references, fences, plugin manifest
npm test               # guard.js and checkpoint.js tests
npm run build:claude   # Claude.ai zips in dist/claude-skills/
node scripts/install.js --dry-run --target ./tmp-skills
```

`npm run check` and `npm test` both run on `prepublishOnly`. `npm run check` verifies the following:

- `bin`/`files` paths exist
- frontmatter is valid for Claude: the name matches the folder, and the description is at most 1024 characters with no angle brackets
- every skill is listed in this README and in `backend-orchestrator`
- every referenced `_shared/` and `references/` file exists
- code fences are balanced
- the plugin manifest version matches `package.json`

## Repository layout

```text
.agents/skills/<skill>/SKILL.md      Skill entry points (one folder per skill)
.agents/skills/<skill>/references/   Detail loaded on demand
.agents/skills/_shared/              Shared rules, host tool map, stack references
.agents/skills/_shared/scripts/      checkpoint.js and guard.js
.claude-plugin/                      Claude Code plugin manifest and marketplace
hooks/                               Claude Code guard hook
scripts/install.js                   NPX/local installer
scripts/build-claude-skills.js       Claude.ai zip builder
scripts/check-package.js             Consistency check (npm run check)
scripts/test-scripts.js              Script tests (npm test)
docs/                                Audit reports
.github/                             Issue and pull request templates
```

`.opencode/` is not part of this repository: the skills create `.opencode/everything-backend-memory/` inside your project at runtime.
