# Version Changelog

> Tracks structural changes to the `.agents/skills` suite.
> Not a project changelog. Only documents skill-doc boundaries, shared prerequisites, and cross-skill consistency fixes.

---

## 0.4.0 (2026-11-02)

IDs refer to docs/audit/2026-10-31-findings-detail.md.

### Added

- **Claude support**: Claude Code plugin (`.claude-plugin/plugin.json`, `marketplace.json`) with a `PreToolUse` guard hook (`hooks/`); installer targets `~/.claude/skills` and `<project>/.claude/skills` (`--host claude`); `npm run build:claude` builds the Claude.ai bundle (see below) (F218).
- **Host-neutral skills**: actions instead of OpenCode tool names; `_shared/host-tools.md` maps them per host, documents enforcement per host and install locations (F050).
- **Enforcement scripts**: `_shared/scripts/checkpoint.js` (start/backup/record/snapshot/status/rollback/close; patch-based undo) and `_shared/scripts/guard.js` (classifies destructive git, migration, SQL, deploy/infra and delete commands as Always Ask First), with `scripts/test-scripts.js` (F088).
- **backend-debug** (bug triage and fixing, F040) and **backend-security** (threat model, OWASP API Top 10, secrets, SAST, supply chain, F054).
- **Stack references**: `_shared/stacks/postgres.md`, `node-typescript.md`, `python-fastapi.md`.
- **Memory schemas** for `test-strategy.md` and `deployment.md` (F016); secrets/PII and trust-boundary rules (F015, F096).

- **SQL and query safety** (`_shared/sql-safety.md`): one mandatory rule set for every skill that writes, reviews, tests or fixes queries. It requires bound parameters only and allowlisted identifiers. It also requires an owner predicate from the authenticated principal on every tenant- or user-owned row, because a WHERE clause is not an access check. It adds a per-stack safe/unsafe API table, NoSQL injection rules, least-privilege DB roles, and hostile-input negative tests before a change counts as done.
- **Claude.ai bundle**: `npm run build:claude` builds one skill, `dist/claude/everything-backend.zip`, that contains every sub-skill. The entry `SKILL.md` checks the bundle against `MANIFEST.json` (SHA-256 per file) with `verify.js` / `verify.py`, and stops on a partial or modified install. Per-skill zips are no longer built.

### Changed

- **guard.js `database-write`** (was `destructive-sql`): asks before any SQL, MongoDB or Redis statement that is not a plain read. That includes UPDATE/DELETE **with** a WHERE clause (`WHERE 1=1` deletes everything), INSERT, MERGE, DDL, GRANT, COPY, side-effect functions (`setval`, `pg_terminate_backend`, `dblink`), `EXPLAIN ANALYZE` of a write, `SELECT ... INTO`, psql `\i`/`\copy`/`\!`, and unknown statements.
- **Progressive disclosure**: every SKILL.md is a lean workflow (all under 210 lines; visualize went from 722 to 171), with templates and catalogs in `<skill>/references/` (F120, F092).
- **backend-deploy**: numbered workflow, outputs and exit criteria, Kubernetes manifests, Dockerfiles per stack, release strategy, rollback, post-deploy verification, gated expand -> deploy -> contract migration step (F058, F060, F063, F028, F057).
- **backend-ops**: resilience patterns and backup/restore/DR (F066, F068).
- **backend-architect** writes `docs/architecture/overview.md` and ADRs in `docs/adr/` (F020).
- **backend-orchestrator**: when-to-use description, routing rules, debug/security routes, Greenfield/Schema Change/Bug Fix workflows, loop caps (F004-F009, F076).
- **context-loading**: `_shared/` resolved inside the skill folder first; greenfield projects are not blocked; one missing-memory rule (F019, F083, F274).
- **check-package.js** also validates Claude frontmatter rules, references/ links, code fences and the plugin manifest.

## Unreleased (2026-06-16)

### Added

- **backend-refactor skill** (`backend-refactor/SKILL.md`): behavior-preserving backend refactoring workflow — characterization tests first, behavior lock, LSP-led reference discovery, incremental refactor patterns (split controller/service, extract module, dependency inversion, strangler fig, modernize legacy), and verification via diagnostics/tests. Reuses the shared checkpoint/rollback contract from `_shared/tool-rules.md` and is routed via `backend-orchestrator`.
- **Shared prerequisites/context doc** (`_shared/context-loading.md`): centralized skill prerequisites and context-loading guidance so individual SKILL.md files don't duplicate setup instructions.
- **Cross-platform prerequisite guidance**: consolidated notes for Windows, macOS, and Linux tooling expectations.

### Fixed

- **backend-visualize routing**: updated `backend-orchestrator` so diagram requests route to the right skill.
- **backend-visualize prerequisite cleanup**: removed the irrelevant `_shared/principles.md`/Security prerequisite from the diagram skill.
- **backend-ops context consistency**: aligned observability/caching/async skill doc with shared context expectations.
- **Checkpoint block deduplication**: removed repeated checkpoint boilerplate that appeared in multiple skill files.
- **Step-number cleanup**: normalized `backend-api-design` to use `Step 1.5` for tool-assisted discovery and `Step 1.6` for API principles.
- **deploy section transition fix**: smoothed awkward handoff between deploy steps that jumped out of order.

### Fixed (P0 audit, 2026-11-02; IDs refer to docs/audit/2026-10-31-findings-detail.md)

- **Installer restored** (`scripts/install.js`) with repo-root/dry-run fix, Cursor target `~/.cursor/skills`, versioned Antigravity `plugin.json`; new `scripts/check-package.js` runs on `prepublishOnly` (F001, F073, F216).
- **`_shared/` resolution** relative to the installed skill folder; a missing shared doc warns instead of stopping (F018).
- **`mode=auto` contract** is now an allowlist with Always Ask First, Production Targets and Test Integrity; `mode=interactive` defined (F002, F042, F053, F084, C015).
- **Rollback** reverse-applies the run's own patches; never `git checkout --`/`reset --hard`/`clean`; colon-free checkpoint names keyed on feature slug (F045, F046, F089, F017).
- **Command Time Budgets** replace the blanket 30 s timeout (F049).
- **Compaction** never archives current state, open issues or accepted decisions; collision-free archive names (F014, C005).
- **Migrations**: dual-write rename, safe NOT NULL, lock/statement timeouts, CONCURRENTLY outside transactions, constraints carried on rename, per-tool notes; only `backend-migrate` writes/applies migrations (F003, F010, F022–F027, F043).
- **Security**: JWT verification rules, CSRF/session hardening, tenant-scoped ownership, safe implement snippets (F029, F033, F035, F048, F159, C008).
- **Orchestrator** step references fixed; `backend-refactor` added to READMEs/templates; post-generation checklist fixed (F008, F041, F171, F220).

### Future

- Boundary and versioning follow-ups: decide whether shared docs get semver tags or rolling dates.
- Evaluate splitting `_shared/principles.md` if it grows past ~120 lines.
- Consider a lightweight test (lint or schema check) that flags drift between SKILL.md prerequisites and `_shared` state.

---

## v0.1.0 (initial)

- First pass at `.agents/skills` directory structure.
- Individual SKILL.md files for: backend-orchestrator, backend-scan, backend-implement, backend-test, backend-deploy, backend-ops, backend-auth, backend-db-design, backend-api-design, backend-architect, backend-migrate, backend-visualize, backend-doctor.
- `_shared/` directory with tool-rules, memory-schema, and principles stubs.
