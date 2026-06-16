---
name: backend-migrate
description: "Own database schema evolution and migration workflows for backend projects. Guides additive changes, destructive changes, expand/contract, zero-downtime deployments, data backfills, rollback planning, and verification. Use this skill when the user says 'migration', 'migrate', 'schema evolution', 'backfill', 'alter table', 'zero downtime', 'rename column', 'add column', or 'rollback migration'."
---

# Backend Migrate

## When to Activate

- User wants to change an existing database schema
- User says "migration", "migrate", "schema evolution", "alter table"
- User needs to add, rename, drop, or change a column/table/index
- User asks about "backfill", "zero downtime", or "rollback migration"
- User needs to evolve schema without breaking running applications

> **Boundary**: For greenfield schema design, use `backend-db-design`. This skill owns schema evolution only.

## Prerequisites

- REQUIRED: project root confirmed and readable
  - Check: `bash -c 'test -d src || test -d app || test -d internal || test -d lib'`
  - If missing: stop and ask the user for the correct project path
- REQUIRED: `_shared/principles.md` loaded (Security section at minimum)
  - Check: `read .agents/skills/_shared/principles.md | head -1`
  - If missing: stop and ask the user to confirm the install location of the shared references; the Database section is required for migration work
- REQUIRED: current schema/migrations directory located
  - Check: `glob 'migrations/**' 'db/migrate/**' 'prisma/migrations/**' 'alembic/versions/**' 'src/main/resources/db/migration/**'`
  - If missing: stop and ask the user to provide the path to the existing migrations directory before proceeding
- RECOMMENDED: `.opencode/everything-backend-memory/tech-stack.md` exists and is non-empty
  - Check: `glob .opencode/everything-backend-memory/tech-stack.md`
  - If missing: run `backend-scan` to populate memory, or proceed with project-only context if the user confirms
- RECOMMENDED: `.opencode/everything-backend-memory/project-overview.md` exists
  - Check: `glob .opencode/everything-backend-memory/project-overview.md`
  - If missing: run `backend-scan` to populate memory, or proceed with project-only context if the user confirms
- RECOMMENDED: `db-schema.md` exists
  - Check: `glob .opencode/everything-backend-memory/db-schema.md`
  - If missing: create an empty `db-schema.md` and append the updated schema after this migration is approved
- RECOMMENDED: `decisions.md` contains prior migration conventions
  - Check: `glob .opencode/everything-backend-memory/decisions.md`
  - If missing: create an empty `decisions.md` and append the convention chosen for this migration
- If any REQUIRED Check fails, run `backend-scan` with `mode=auto`, then re-run these checks. If the missing file is a project file (e.g., manifest, source dir) that `backend-scan` cannot create, stop and ask the user.

## Required Context (load in order; stop if context budget is tight)

1. REQUIRED: `_shared/principles.md` → only relevant sections (Database for migrate)
2. REQUIRED: `tech-stack.md` (small, essential)
3. REQUIRED: `project-overview.md`
4. OPTIONAL: `db-schema.md` (essential for migrate)
5. OPTIONAL: `api-patterns.md`
6. OPTIONAL: `decisions.md` (only if prior decisions matter)
7. SKIP: `issues.md` unless reviewing risks

## Migration Design

Apply the database principles in `_shared/principles.md` when evolving schema.

### Prefer Additive-Only Changes

Additive changes are the safest default. They extend the schema without invalidating existing code.

Safe additions:

```sql
ALTER TABLE orders ADD COLUMN metadata JSONB;
CREATE INDEX CONCURRENTLY idx_orders_status ON orders(status);
```

Avoid in the same deploy:

- Dropping a column that active code still reads
- Renaming a column without a compatibility alias
- Adding `NOT NULL` without a default on an existing table
- Changing a column type in place

### Expand/Contract Pattern

Use expand/contract when you must replace a structure without downtime.

1. **Expand**: add the new column/table/index alongside the old one
2. **Migrate**: backfill or dual-write until old and new are in sync
3. **Switch**: update application code to read from the new structure
4. **Contract**: remove the old column/table/index only after everything is stable

Example: rename `email` to `contact_email`.

```sql
-- expand
ALTER TABLE users ADD COLUMN contact_email TEXT;

-- migrate
UPDATE users SET contact_email = email WHERE contact_email IS NULL;

-- switch application reads/writes to contact_email

-- contract
ALTER TABLE users DROP COLUMN email;
```

## Zero-Downtime Strategies

### Adding Columns with Defaults

Adding `NOT NULL` with a default can lock large tables while the database rewrites rows.

Safer sequence:

```sql
ALTER TABLE users ADD COLUMN loyalty_tier INT DEFAULT 1;
UPDATE users SET loyalty_tier = 1 WHERE loyalty_tier IS NULL;
ALTER TABLE users ALTER COLUMN loyalty_tier SET NOT NULL;
```

For PostgreSQL 11+, a non-volatile default may avoid a full rewrite. Still verify on a copy first.

### Renaming via Dual Writes

Renames are breaking changes. Use the expand/contract pattern:

1. Add the new column
2. Write to both old and new columns in application code
3. Backfill the new column in batches
4. Switch reads to the new column
5. Stop writing to the old column
6. Drop the old column in a later release

### Index Creation Concurrently

Default `CREATE INDEX` locks writes. Use concurrent builds when supported:

```sql
CREATE INDEX CONCURRENTLY idx_orders_created_at ON orders(created_at);
```

Concurrent index builds may fail silently on PostgreSQL; verify with `pg_index` or re-run if needed.

## Data Backfills

### Batching

Backfills must not hold long transactions or lock rows indefinitely.

```sql
-- process a slice
UPDATE users
SET legacy_id = uuid_generate_v4()
WHERE legacy_id IS NULL
  AND id > :cursor
  AND id <= :cursor + :batch_size;
```

Recommended rules:

- Batch size: start with 1,000–10,000 rows and tune by observed lock time
- Commit after each batch
- Sleep briefly between batches to yield CPU and I/O
- Order by an indexed, monotonic key (primary key or `created_at`) when possible

### Idempotency

Backfill scripts should be safe to rerun.

```sql
UPDATE orders
SET normalized_email = LOWER(email)
WHERE normalized_email IS NULL;
```

Running this twice changes nothing because `normalized_email` is already populated.

### Progress Tracking

Track long-running backfills so you can resume after interruption:

```sql
CREATE TABLE migration_progress (
  migration_name TEXT PRIMARY KEY,
  last_cursor    BIGINT NOT NULL,
  completed_at   TIMESTAMPTZ
);
```

For large jobs, log per-batch metrics (rows processed, duration, errors) and alert on failure.

### Backfill Rollback

Stop a bad backfill immediately. For destructive transforms, keep the original column until the backfill is validated, then correct affected rows or restore from backup.
## Rollback Planning

### Down Migrations

Provide a down migration for every forward migration when the framework supports it. It should undo the schema change exactly.

```sql
-- up
ALTER TABLE users ADD COLUMN phone TEXT;

-- down
ALTER TABLE users DROP COLUMN phone;
```

### Restore Strategies

- **Logical restore**: reverse the migration, fix data, re-run
- **Snapshot restore**: restore from a backup taken before the migration
- **Point-in-time recovery**: use continuous backups to recover to a known good state

Always know the recovery time objective (RTO) and recovery point objective (RPO) before running a risky migration.

### When Rollback Is Unsafe

Do not attempt a simple down migration if:

- New application code has already written data the old schema cannot represent
- A destructive change removed data that has no backup
- A migration touched multiple systems (database, cache, external store) inconsistently
- The migration ran partially and left data in an unknown state

In those cases, prefer forward-fix or a full restore instead.

## Verification

### Test Migrations Against Staging

Before production, run the migration against a staging database that mirrors production volume and schema.

Checklist:

- [ ] Migration completes without errors
- [ ] Migration runtime is acceptable for the maintenance window
- [ ] No long-lived locks during the migration
- [ ] Down migration also succeeds
- [ ] Application health checks pass after the migration

### Validate Constraints

After adding constraints or indexes, verify them:

```sql
-- list invalid indexes on PostgreSQL
SELECT * FROM pg_index WHERE NOT indisvalid;

-- check constraint states
SELECT conname, convalidated FROM pg_constraint
WHERE conrelid = 'users'::regclass;
```

### Check Query Plans

A new index or column type can change optimizer behavior.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT 100;
```

Compare plans before and after the migration. Ensure the chosen plan is still efficient.

## Decision Trees

### Small Table vs Large Table

| Table size | Approach |
|------------|----------|
| Small (< 1M rows, < few GB) | Standard migration is usually fine; verify lock time |
| Large | Use concurrent index builds, batched backfills, expand/contract, and a maintenance window |

### Online vs Offline Migration

| Scenario | Recommendation |
|----------|----------------|
| Add nullable column | Online with `ALTER TABLE` |
| Add `NOT NULL` column | Online in stages: add nullable → backfill → add constraint |
| Rename column | Online via expand/contract and dual writes |
| Drop unused column | Online after code no longer references it |
| Change column type | Offline or expand/contract with a new column |
| Rebuild large table | Online with shadow table + cutover, or planned downtime |

## Workflow

1. Inspect `.opencode/everything-backend-memory/` and existing migrations for the current schema and conventions
2. Decide if the change is additive or requires expand/contract
3. Choose online vs offline based on table size and risk
4. Write the forward migration and a safe down migration
5. Add idempotent backfill scripts if data must move
6. Test on a production-like staging database
7. Verify constraints, indexes, and query plans
8. Deploy with monitoring and a documented rollback path

## Concurrent & Partial Work

This skill participates in the shared checkpoint contract defined in `_shared/tool-rules.md` (Concurrent & Partial Work).

### Checkpoint
- File: `.opencode/everything-backend-memory/.checkpoints/backend-migrate-<ISO-timestamp>.json`
- Required fields:
  - `feature_slug`: user-provided or auto-derived identifier for the change set (e.g., `user-registration`, `order-cancel`).
  - `started_at`: ISO-8601 timestamp.
  - `completed_steps`: array of step names already finished.
  - `pending_steps`: array of step names still to run.
  - `generated_files`: array of file paths this run created or modified.
  - `memory_updates`: array of memory files this run appended to.

### Resume
1. On start, run `glob .opencode/everything-backend-memory/.checkpoints/backend-migrate-*.json`.
2. If a checkpoint exists, ask the user: "Resume from `<pending_steps[0]>` or start over?"
   - In `mode=auto`, default to "resume" unless the checkpoint is older than 24 hours, in which case start over (and move the old checkpoint to `.checkpoints/archive/`).
3. If resuming, re-load the checkpoint and skip `completed_steps`.
4. Migration checkpoints MUST be cleared only after the down migration has been verified; do not auto-delete a checkpoint on resume.

### Rollback
1. Read the checkpoint's `generated_files` list.
2. For each file, present `git checkout -- <file>` as the rollback command. Never run destructive deletions automatically.
3. After the user confirms, run the listed `git checkout` commands and delete the checkpoint file.
4. If a file was added (not just modified), suggest `git rm` or `rm` for the user to run, but do not execute it.

### Multi-feature isolation
- Every run MUST set a `feature_slug` before any write operation. If the user did not provide one, derive it from the first relevant file or ask.
- Two concurrent runs of this skill with different `feature_slugs` must run in isolation — they do not share checkpoints or generated file lists.
- Two concurrent runs with the SAME `feature_slug` are a collision: refuse to start and tell the user to either wait or pick a different slug.

### Partial completion
- If the run stops after some `generated_files` have been written but before all `pending_steps` finish, the checkpoint must still be saved.
- On the next invocation, the resume step above applies. The user can pick which `pending_steps` to redo or skip.
