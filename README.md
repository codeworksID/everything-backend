# everything-backend

Reusable Opencode backend skills for project discovery, architecture, database design, API design, implementation, health checks, and memory refresh.

## Included skills

- `backend-orchestrator`
- `backend-discovery`
- `backend-architect`
- `backend-db-design`
- `backend-api-design`
- `backend-implement`
- `backend-doctor`
- `backend-refresh-memory`

## Installation

### Option 1: Install with `npx` from GitHub

```bash
npx github:codeworksID/everything-backend
```

That command runs the included installer and copies the skills into your global Opencode skills directory:

- Windows: `%USERPROFILE%\.agents\skills`
- macOS / Linux: `~/.agents/skills`

### Option 2: Clone and install locally

```bash
git clone https://github.com/codeworksID/everything-backend.git
cd everything-backend
node scripts/install.js
```

### Option 3: Package form after publishing to npm

```bash
npx everything-backend-opencode-skills
```

## Installer options

```bash
node scripts/install.js --help
```

Available flags:

- `--dry-run` — show what would be copied without writing files
- `--force` — overwrite existing installed skills
- `--target <path>` — install to a custom skills directory

Examples:

```bash
node scripts/install.js --dry-run
node scripts/install.js --force
node scripts/install.js --target "C:\Users\you\.agents\skills"
```

## What gets installed

The installer copies every folder from `.agents/skills/` into your global Opencode skills directory. Each skill is installed as:

```text
~/.agents/skills/<skill-name>/SKILL.md
```

## Usage in Opencode

After installation, the skills are available by name. Examples:

- `backend-orchestrator` — route backend requests to the right sub-skill
- `backend-discovery` — inspect an existing backend codebase
- `backend-api-design` — design endpoints and schemas
- `backend-implement` — turn designs into code
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
