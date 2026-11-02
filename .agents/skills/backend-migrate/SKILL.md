---
name: backend-migrate
description: Writes and applies database schema migrations safely for existing backend projects. Plans additive changes and expand/contract with dual-write, safe NOT NULL and constraint changes, lock and statement timeouts, concurrent index builds, batched backfills, rollback and backup gates, and a phase plan that tells deploy what runs before and after the app rollout. Covers Prisma, Alembic, Django, Rails, Flyway, Liquibase, EF Core, TypeORM, Sequelize, Knex, Drizzle, golang-migrate and goose, PostgreSQL first with MySQL and MongoDB notes. Use when the user says database migration, schema migration, schema change, alter table, add column, rename column, drop column, add index, backfill, zero-downtime migration, expand/contract, or rollback migration. Not for code, framework or service migrations (use backend-refactor) or greenfield schema design (use backend-db-design).
---

# Backend Migrate

Evolves a live database schema without downtime or data loss. This is the only skill that writes migration files, and the only skill that applies them from an agent session. backend-deploy wires approved migrations into the pipeline as a gated step; it never authors them.

## When to Use

- Change an existing schema: add, rename, drop or retype a column, table, index or constraint.
- Write a backfill, plan a zero-downtime change, or roll a migration back.
- Continue a multi-release expand/contract change recorded in the phase plan.
- Receive a target schema from backend-db-design or a schema change from backend-implement.

Not for: code or framework migrations, strangler-fig rewrites (backend-refactor); greenfield schema design (backend-db-design); running the deploy itself (backend-deploy); backup and DR setup (backend-ops).

## Before You Start

1. Resolve the shared docs folder ("<shared>"): first `_shared/` inside this skill's folder (bundled installs, e.g. Claude.ai), then `../_shared/` next to it; other fallbacks are in `<shared>/context-loading.md` -> Resolving `_shared/` Files. A missing shared doc is a warning, not a stop.
2. Read `<shared>/tool-rules.md` (mode=auto contract, Production Targets, Command Time Budgets, checkpoints) and `<shared>/host-tools.md` if the action names below don't match your host's tools. Read the Database section of `<shared>/principles.md`.
3. Load project memory per `<shared>/context-loading.md`, with `db-schema.md`, `tech-stack.md` and `decisions.md` as high priority, plus the `## Migration Phases` section of `deployment.md` if it exists. Missing memory is fine: create the file you need when you first append to it (format in `<shared>/memory-schema.md`).
4. If the detected stack matches a file in `<shared>/stacks/`, read it. For PostgreSQL read `<shared>/stacks/postgres.md`.
5. Identify the migration tool and directory: find manifest and config files and search for migration folders recursively ([references/tools.md](references/tools.md) -> Detect the Tool and Directory). If nothing matches, ask the user which tool and path to use. Do not guess.
6. Check for an open phase plan entry for this change. If one exists, report its status and resume at the next phase instead of starting over.

## Core Safety Rules

These are non-negotiable. Details and examples live in the references.

1. **Additive first.** Prefer changes that old and new code both tolerate. Do not, in one deploy: drop a column active code reads, rename without a compatibility path, add NOT NULL to an existing column in one step, or change a column type in place.
2. **Expand/contract with dual-write.** Replace structures in separate releases: expand, dual-write (app or trigger; required, not optional), batched backfill, parity check = 0, switch reads, stop writing old, then contract in a LATER release. Never expand and contract in one migration. See [references/expand-contract.md](references/expand-contract.md).
3. **Carry constraints on rename.** The new column gets the old one's NOT NULL, UNIQUE, CHECK, defaults, indexes and FKs, and every dependent (views, triggers, functions, policies, CDC, ORM mappings) is updated before contract.
4. **Safe NOT NULL.** Constant default on add (PostgreSQL 11+), or for an existing column: batched backfill, `CHECK ... NOT VALID`, `VALIDATE CONSTRAINT` in a separate transaction, `SET NOT NULL` (PG 12+), drop the CHECK. FK and CHECK constraints use `NOT VALID` then `VALIDATE`; UNIQUE uses a concurrent unique index.
5. **Timeouts on every DDL session.** `SET lock_timeout` (short) and `statement_timeout`; check for long transactions first; retry with backoff from an approved script. MySQL: `lock_wait_timeout` and an explicit `ALGORITHM`. See [references/zero-downtime.md](references/zero-downtime.md).
6. **CONCURRENTLY, outside a transaction.** Index builds and drops on existing PostgreSQL tables use `CONCURRENTLY`, one statement per migration file, with the tool's no-transaction opt-out. Never "fix" the error by dropping `CONCURRENTLY`. Clean up INVALID indexes before retrying.
7. **Review generated SQL.** Generators often turn a rename into drop + add. Read every generated migration for `DROP`, type changes and table rewrites before it is applied.
8. **Contract is one-way and gated.** Before any DROP: no references remain, a release has run without the old structure, a restorable backup or PITR covers the last write (backup gate), and the user confirmed. Down migrations cannot bring dropped data back; label them one-way.

## Execution Boundary

Follows `<shared>/tool-rules.md` -> `mode=auto` Contract; that contract wins on any conflict.

- **Runs without asking:** reading schema and migration files; generating or editing migration files, backfill scripts, runbooks and memory; running a generator that connects to a database only when that database is provably local; read-only queries against a provably local database; any command against a disposable database this run started (Testcontainers, a local container it launched, a temp SQLite file) or a tool's shadow database on a provably local server.
- **Always Ask First (also in mode=auto):** applying migrations up or down, any DDL or DML, backfills, drops, restores, any DB-resetting command ([references/tools.md](references/tools.md) lists them per tool), and any query against a database that is not provably local, read-only ones included (long-transaction check, dependents query, parity counts, `EXPLAIN`). A provably local database this run did not start (a developer's dev database) is not disposable: applying there is still Ask First. Never run a DB-resetting or data-losing command against a shared database, even when asked in passing: name the command and ask.
- Treat the target as production unless it is provably local (`<shared>/tool-rules.md` -> Production Targets). Read the connection string the tool will actually use (`DATABASE_URL`, `alembic.ini`, `settings.py`, `appsettings*.json`, `flyway.conf`, ...). A name containing dev, staging or test is not proof.
- When asking, show: target host and database (credentials redacted), whether it is provably local, the exact command, the SQL it will run, the lock each statement takes, expected runtime, backup status, and whether the step is one-way.
- Never use `EXPLAIN ANALYZE` on DML outside a local database: it executes the statement.
- Never kill a running migration (`<shared>/tool-rules.md` -> Command Time Budgets). If an apply fails or runs long, report it as "did not complete", record the state in the phase plan, and stop. Do not retry destructive steps or roll back on your own.

## Workflow

1. **Understand the change.** Read the current schema from migrations, models and `db-schema.md`. Use the plan from backend-db-design or backend-implement when one was handed over. Output: the before and after schema, in a few lines.
2. **Classify.** Decide additive vs expand/contract. For each statement, name the lock it takes and how long it holds it, and choose online vs offline ([references/zero-downtime.md](references/zero-downtime.md) -> Decision Tables). Output: the phase list.
3. **Start a checkpoint** (see Checkpoints below) with one step per phase you will write now.
4. **Write the migrations** with the project's tool and naming convention: generate, then review and hand-edit the SQL. Add timeouts, no-transaction opt-outs and one concurrent statement per file. Write a down migration for each, and label each file expand/contract/backfill, pre-deploy/post-deploy/job, and one-way where true. Output: migration files.
5. **Write backfills** if data moves: keyset-batched, idempotent, resumable, with a parity check ([references/backfills.md](references/backfills.md)). Output: backfill script or job.
6. **Verify locally** on a disposable database: up, down, up; linter and drift check if available; tests that touch the changed tables ([references/rollback-and-verification.md](references/rollback-and-verification.md)). Report anything not run as "did not run".
7. **Write the phase plan and runbook** ([references/phase-plan.md](references/phase-plan.md)): the `## Migration Phases` entry in `deployment.md`, a `decisions.md` entry, and `docs/runbooks/migration-<slug>.md` with order of releases, commands, timeouts, parity checks, backup gate and rollback path.
8. **Apply only with approval.** Ask First, then apply to the approved target (staging first). After each apply, record the environment, date and migration IDs in the phase plan and validate constraints and indexes. Production applies happen only on explicit approval, normally through the deploy pipeline step.
9. **Update memory.** Append the new schema to `db-schema.md`, mark columns pending contract as deprecated there, and close the checkpoint.
10. **Schedule the contract.** Leave the contract migration for a later release behind the Contract Gate, with the gate checklist in the phase plan entry.

Done when: migrations, down migrations and any backfill are written and labeled; local verification ran (or each skipped check is reported with the reason); the phase plan entry, decisions entry and runbook exist; any approved apply is recorded with migration IDs; `db-schema.md` is updated; and the checkpoint is closed.

## Hand-off to Deploy

backend-deploy reads the phase plan, not this skill's prose. Each migration must carry:

- **Kind:** `expand` (old and new code both work), `contract` (only new code works) or `backfill`.
- **Timing:** `pre-deploy` (expand: runs as one gated step before the app rollout, from a single runner holding the migration lock, never from every replica at startup), `post-deploy` (contract: only after every instance runs the new code, in a later release, after the Contract Gate passes), or `job` (long backfills, after dual-write is live).
- **Reversible or one-way**, and the backup gate status for one-way steps. If backups or PITR are not set up, stop before contract and route the user to backend-ops backup and restore guidance.

Track the change across releases in the `## Migration Phases` entry (status: planned, expand-applied, dual-write-live, backfilled, reads-switched, old-writes-stopped, contract-ready, contracted, abandoned) and keep the `decisions.md` entry's status in step. Every later run reads this first and resumes at the next phase.

## Outputs

| Output | Path |
|--------|------|
| Migration and down files | the project's migrations directory, tool naming convention |
| Backfill script or job | project convention, else `scripts/backfills/<slug>.<ext>` |
| Runbook | `docs/runbooks/migration-<slug>.md` |
| Phase plan | `.opencode/everything-backend-memory/deployment.md` -> `## Migration Phases` |
| Decision record | `.opencode/everything-backend-memory/decisions.md` |
| Updated schema | `.opencode/everything-backend-memory/db-schema.md` |

The memory folder path is the same on every host.

## Checkpoints and Rollback

Start a checkpoint before the first edit:

```bash
node <shared>/scripts/checkpoint.js start --skill backend-migrate --feature <slug>
```

Record each file you create or edit (`checkpoint.js record --skill backend-migrate --feature <slug> --created a,b --modified c,d`, plus `--memory <file>` for memory updates and `--done <step>` per finished step), run `checkpoint.js snapshot` after each step, and `checkpoint.js close` when done. If `start` exits with code 3, an open checkpoint exists: offer to resume it or restart with `--restart`. If Node is unavailable, follow `<shared>/tool-rules.md` -> Concurrent & Partial Work by hand.

Close the checkpoint as `completed` only after the rollback path is verified: the down migration passed the up, down, up check (Workflow step 6), or, for a one-way step, the forward-fix or restore path is written in the runbook. If the down check could not run (no disposable database), mark the phase plan entry "rollback path unverified" and say so in the report before closing; never close as if the rollback were proven.

File rollback (`checkpoint.js rollback`) only reverts files. It does not undo a migration already applied to a database. For an applied migration, propose its down migration or a forward-fix migration (Always Ask First), using the migration IDs recorded in the phase plan, and only then offer to revert the files.

## References

- [references/expand-contract.md](references/expand-contract.md): read when renaming, retyping, splitting or dropping anything, or writing a dual-write trigger; holds the full rename example, Carry Constraints and the Contract Gate.
- [references/zero-downtime.md](references/zero-downtime.md): read before writing any DDL for an existing table; lock timeouts, safe NOT NULL, constraints, concurrent indexes, decision tables, MySQL and MongoDB notes.
- [references/tools.md](references/tools.md): read when detecting the tool, generating migrations, needing a no-transaction opt-out, resolving parallel-branch conflicts, or adding a linter.
- [references/backfills.md](references/backfills.md): read when any data must move or be transformed.
- [references/rollback-and-verification.md](references/rollback-and-verification.md): read when writing down migrations, verifying locally or on staging, checking query plans, or rolling back.
- [references/phase-plan.md](references/phase-plan.md): read when writing the phase plan, runbook or decisions entry, or resuming a multi-release change.
