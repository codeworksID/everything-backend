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

> **Boundary**: For greenfield schema design, use `backend-db-design`. This skill owns schema evolution and is the ONLY skill that writes migration files and the only one that applies them. `backend-db-design` hands over a target schema and a migration plan (no migration files); `backend-implement` hands schema changes here. Applying always follows `_shared/tool-rules.md` → Always Ask First (see Execution Boundary below).

## Prerequisites

See `_shared/context-loading.md` for standard prerequisites (project root check, manifest detection, shared file presence, memory fallback rules, and staleness check).

Migration-specific prerequisites below:

- REQUIRED: current schema/migrations directory located
  - Check: `glob 'migrations/**' 'db/migrate/**' 'prisma/migrations/**' 'alembic/versions/**' 'src/main/resources/db/migration/**'`
  - If missing: stop and ask the user to provide the path to the existing migrations directory before proceeding
- REQUIRED: `_shared/principles.md` loaded (Database section required for migration work)
  - Check: resolve `_shared/principles.md` as described in `_shared/context-loading.md` → Resolving `_shared/` Files (sibling of this skill's folder first)
  - If missing: warn once and continue with this skill's own rules; do not stop
- REQUIRED: migration tool identified (see Tool-Specific Workflows)
  - Check: manifest/config files (`prisma/schema.prisma`, `alembic.ini`, `manage.py`, `db/migrate/`, `flyway.conf`/`flyway.toml`, `liquibase.properties`, `*.csproj` with `Microsoft.EntityFrameworkCore.Design`, `ormconfig`/`data-source.ts`, `.sequelizerc`, `*.up.sql`/`*.down.sql` pairs for golang-migrate)
  - If missing: ask the user which tool generates and applies migrations; do not guess
- RECOMMENDED: `db-schema.md` exists
  - Check: `glob .opencode/everything-backend-memory/db-schema.md`
  - If missing: create an empty `db-schema.md` and append the updated schema after this migration is approved
- RECOMMENDED: `decisions.md` contains prior migration conventions
  - Check: `glob .opencode/everything-backend-memory/decisions.md`
  - If missing: create an empty `decisions.md` and append the convention chosen for this migration

## Required Context

See `_shared/context-loading.md` → Standard Required Context Priority List for load order and fallback rules.

Migration-specific additions:

- `_shared/principles.md` → Database section is REQUIRED (not just recommended)
- `db-schema.md` is high priority for migration work (load alongside `tech-stack.md`)
- `decisions.md` is load-worthy when prior migration conventions exist
- `issues.md` → skip unless reviewing risks or known debt

## Migration Design

Apply the database principles in `_shared/principles.md` when evolving schema.

### Prefer Additive-Only Changes

Additive changes are the safest default. They extend the schema without invalidating existing code.

Safe additions (each in its own migration, with the lock timeouts below):

```sql
ALTER TABLE orders ADD COLUMN metadata JSONB;
-- must run outside a transaction block; see Index Creation Concurrently
CREATE INDEX CONCURRENTLY idx_orders_status ON orders(status);
```

Avoid in the same deploy:

- Dropping a column that active code still reads
- Renaming a column without a compatibility alias
- Adding `NOT NULL` to an existing column in one step (see Adding NOT NULL)
- Changing a column type in place

### Expand/Contract Pattern

Use expand/contract when you must replace a structure without downtime. Each phase ships as its own migration and release; never put expand and contract in one migration.

1. **Expand**: add the new column/table/index alongside the old one, nullable, with the old structure's constraints mirrored (see Carry Constraints and Dependents)
2. **Dual-write**: deploy application code that writes both old and new on every insert/update. Dual-write is required, not optional: a backfill alone misses rows written after it runs
3. **Backfill**: copy existing rows in batches (see Data Backfills)
4. **Parity check**: confirm the mismatch count is 0 before going further
5. **Switch reads**: deploy code that reads the new structure (still dual-writing)
6. **Stop writing old**: deploy code that writes only the new structure
7. **Contract**: in a LATER release, after references are gone and a backup exists, drop the old structure (always Ask First)

Example: rename `users.email` (`TEXT UNIQUE NOT NULL`) to `contact_email`. Each block below is a separate migration or release.

```sql
-- release 1, migration A: expand (nullable, metadata-only)
ALTER TABLE users ADD COLUMN contact_email TEXT;

-- release 1, migration B: mirror UNIQUE without blocking writes (no transaction)
CREATE UNIQUE INDEX CONCURRENTLY users_contact_email_key ON users (contact_email);

-- release 2: application dual-writes email and contact_email on every write

-- release 2, backfill job: batched, idempotent, resumable; repeat until 0 rows
UPDATE users SET contact_email = email
WHERE id IN (
  SELECT id FROM users
  WHERE id > :last_id AND contact_email IS DISTINCT FROM email
  ORDER BY id
  LIMIT 5000
)
RETURNING id;  -- next :last_id = max(returned id)

-- release 2, parity check: must return 0 before continuing
SELECT count(*) FROM users WHERE contact_email IS DISTINCT FROM email;

-- release 2, migrations C1-C3: carry NOT NULL (see Adding NOT NULL)
-- C1
ALTER TABLE users ADD CONSTRAINT users_contact_email_not_null
  CHECK (contact_email IS NOT NULL) NOT VALID;
-- C2
ALTER TABLE users VALIDATE CONSTRAINT users_contact_email_not_null;
-- C3
ALTER TABLE users ALTER COLUMN contact_email SET NOT NULL;  -- PG 12+: no scan
ALTER TABLE users DROP CONSTRAINT users_contact_email_not_null;

-- release 3: application reads contact_email, still dual-writes

-- release 4, migration D: old column must accept missing writes
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
-- release 4: application writes contact_email only

-- release 5 (later, after Contract Gate): contract
ALTER TABLE users DROP COLUMN email;
```

When application dual-write is impractical (many writers, legacy services), a `BEFORE INSERT OR UPDATE` trigger can copy `email` into `contact_email` while every writer still writes the old column. Before removing the trigger, switch every writer to dual-write (or to writing the new column), then re-run the parity check after removal; removing it while some writers still write only `email` silently drops their updates to `contact_email`. Do not let any writer write only the new column while a one-way trigger is active, or it will overwrite new values. If writers move over gradually, use a trigger that copies whichever column changed (compare `NEW` with `OLD`) for the transition.

### Carry Constraints and Dependents

A rename or replacement column must end up with everything the old one had:

- `NOT NULL` (validated CHECK path), `UNIQUE` (unique index built concurrently; add `ADD CONSTRAINT ... UNIQUE USING INDEX <name>` if FKs must reference it), `CHECK` constraints, defaults, and every index that includes the old column (including partial and composite indexes)
- Foreign keys from or to the column: add the new FK as `NOT VALID`, then `VALIDATE CONSTRAINT` (see Adding Constraints Without Long Locks)
- Dependents to update before contract: views, materialized views, triggers, functions and procedures, generated columns, row-level security policies, publications/CDC connectors, analytics and ETL consumers, ORM mappings and serializers, and raw SQL in code

Find dependent views and materialized views on PostgreSQL (function bodies are not tracked here; grep `pg_proc.prosrc` and the codebase too):

```sql
SELECT DISTINCT v.oid::regclass AS dependent_view
FROM pg_depend d
JOIN pg_rewrite r ON r.oid = d.objid
JOIN pg_class v ON v.oid = r.ev_class
JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
WHERE d.classid = 'pg_rewrite'::regclass
  AND d.refclassid = 'pg_class'::regclass
  AND d.refobjid = 'users'::regclass
  AND a.attname = 'email';
```

### Contract Gate

Before any DROP of a column, table, index or constraint:

- [ ] No code path, query, view, trigger or consumer references the old structure (codebase grep plus the dependents query above)
- [ ] At least one release has run in production without reading or writing it
- [ ] A backup or snapshot taken after the last write to it exists, and the restore path is known
- [ ] The user confirmed the drop (`_shared/tool-rules.md` → Always Ask First)

## Zero-Downtime Strategies

### Lock Timeouts for DDL

Every `ALTER TABLE` needs a table lock, even when the change itself is metadata-only. On PostgreSQL a waiting `ACCESS EXCLUSIVE` request queues behind any open transaction on the table, and every later query on that table (including plain `SELECT`s) queues behind the DDL. One long-running transaction can turn an instant DDL into an outage. Classify each operation by the lock it takes and how long it holds it, not by row count.

Before running DDL, check for long transactions:

```sql
SELECT pid, now() - xact_start AS xact_age, state, left(query, 80) AS query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_start
LIMIT 10;
```

Set timeouts in every migration session:

```sql
SET lock_timeout = '5s';         -- give up waiting for the lock instead of blocking traffic
SET statement_timeout = '60s';   -- bound statements that should be quick
-- inside a transaction, SET LOCAL limits the setting to that transaction
```

- Keep the short `lock_timeout` for statements that take `ACCESS EXCLUSIVE` or `SHARE` locks (most `ALTER TABLE`, plain `CREATE INDEX`, `ADD CONSTRAINT ... NOT VALID`)
- On a `lock_timeout` error, retry with backoff (for example 5 attempts, doubling a 2s wait). Build that retry into the migration script or runbook the user approved; the agent itself does not re-run a failed apply without asking again (see Execution Boundary)
- If the migration runs inside a single transaction, a `lock_timeout` failure rolls back cleanly. Otherwise (non-transactional migrations such as concurrent index builds, tools that run statements one by one, all MySQL DDL, which commits implicitly) check what was applied before retrying
- For long but weakly locking statements (`CREATE INDEX CONCURRENTLY`, `REINDEX CONCURRENTLY`, `DROP INDEX CONCURRENTLY`, `VALIDATE CONSTRAINT`), raise `lock_timeout` for that statement too (for example `SET lock_timeout = '0'` or a few minutes) and raise or disable `statement_timeout`. They wait for older transactions and conflicting locks, and those waits count against `lock_timeout`, but while waiting they do not block normal reads and writes (only other DDL and autovacuum on that table). Run the long-transaction check first. After any timeout or cancel of a concurrent build, run the INVALID-index query (see Index Creation Concurrently) and drop the invalid index before retrying
- Batched backfills: keep `lock_timeout` short (row locks), and bound each batch with `statement_timeout`
- These are database-side limits. The agent never kills a running migration itself (`_shared/tool-rules.md` → Command Time Budgets)
- MySQL: `SET SESSION lock_wait_timeout = 5;` (seconds; the default is one year). Metadata locks queue the same way, so check `information_schema.innodb_trx` and `SHOW PROCESSLIST` for long transactions first

### Adding NOT NULL

New column with a constant default (PostgreSQL 11+): metadata-only, no table rewrite and no scan.

```sql
ALTER TABLE users ADD COLUMN loyalty_tier INT NOT NULL DEFAULT 1;
```

This holds for non-volatile defaults only. A volatile default (`gen_random_uuid()`, `clock_timestamp()`, `random()`) rewrites the whole table under `ACCESS EXCLUSIVE`; instead add the column nullable, set the default for new rows, batch-backfill, then follow the existing-column path. Before PostgreSQL 11 any default rewrites the table.

Existing column (make sure the application already writes non-NULL values; the NOT VALID check is enforced for new writes immediately). Run steps 2 and 3 in separate migrations or transactions: if `VALIDATE` runs in the same transaction as the `ADD CONSTRAINT`, the `ACCESS EXCLUSIVE` lock is held for the whole scan.

```sql
-- 1. batched backfill until no NULLs remain (see Data Backfills)
-- 2. brief ACCESS EXCLUSIVE lock, no scan
ALTER TABLE users ADD CONSTRAINT users_loyalty_tier_not_null
  CHECK (loyalty_tier IS NOT NULL) NOT VALID;
-- 3. full scan under SHARE UPDATE EXCLUSIVE: reads and writes continue
ALTER TABLE users VALIDATE CONSTRAINT users_loyalty_tier_not_null;
-- 4. PostgreSQL 12+: the validated CHECK proves no NULLs, so no scan
ALTER TABLE users ALTER COLUMN loyalty_tier SET NOT NULL;
-- 5. the CHECK is now redundant
ALTER TABLE users DROP CONSTRAINT users_loyalty_tier_not_null;
```

On PostgreSQL 11 and older, step 4 scans the whole table under `ACCESS EXCLUSIVE`; keep the validated CHECK instead of `SET NOT NULL` on large tables.

MySQL: state the algorithm explicitly (`ALGORITHM=INSTANT`, or `ALGORITHM=INPLACE, LOCK=NONE`) so the statement fails instead of silently falling back to a blocking table copy. For large tables where only a copy works, use gh-ost or pt-online-schema-change.

### Adding Constraints Without Long Locks

- **CHECK / FOREIGN KEY**: `ADD CONSTRAINT ... NOT VALID` (short lock, no scan), then `VALIDATE CONSTRAINT` in a separate transaction (scan without blocking writes)
- **UNIQUE / PRIMARY KEY**: `CREATE UNIQUE INDEX CONCURRENTLY`, then `ALTER TABLE ... ADD CONSTRAINT <name> UNIQUE USING INDEX <index>` (or `PRIMARY KEY USING INDEX`). For `PRIMARY KEY`, first make the columns `NOT NULL` via the CHECK `NOT VALID` → `VALIDATE` → `SET NOT NULL` path (PostgreSQL 12+, see Adding NOT NULL); otherwise `USING INDEX` runs an implicit `SET NOT NULL` that scans the table under `ACCESS EXCLUSIVE`

### Renaming via Dual Writes

Renames are breaking changes. Follow the Expand/Contract Pattern above (expand → dual-write → batched backfill → parity check → switch reads → stop writing old → contract in a later release) and Carry Constraints and Dependents. `ALTER TABLE ... RENAME COLUMN` is instant but breaks every running instance that uses the old name; use it only when all readers and writers can switch atomically (for example during planned downtime).

### Index Creation Concurrently

Default `CREATE INDEX` blocks writes for the whole build. On PostgreSQL use concurrent builds on existing tables:

```sql
CREATE INDEX CONCURRENTLY idx_orders_created_at ON orders(created_at);
```

- `CREATE INDEX CONCURRENTLY` (and `DROP INDEX CONCURRENTLY`, `REINDEX CONCURRENTLY`) cannot run inside a transaction block. Check whether the migration tool wraps each migration in a transaction and use its opt-out: Rails `disable_ddl_transaction!` (with `algorithm: :concurrently`), Django `atomic = False` on the `Migration` class (or `AddIndexConcurrently` from `django.contrib.postgres.operations`), Alembic `with op.get_context().autocommit_block():`, Liquibase `runInTransaction="false"` on the changeSet, EF Core `migrationBuilder.Sql(..., suppressTransaction: true)`. For other tools, confirm the opt-out in the tool's docs; never fix the error by dropping `CONCURRENTLY`
- Put one concurrent statement per migration file: a multi-statement script sent in one call runs as an implicit transaction on PostgreSQL
- A failed or cancelled concurrent build raises an error and leaves an INVALID index that still slows writes. Find it, drop it, retry:

```sql
SELECT indexrelid::regclass AS index_name, indrelid::regclass AS table_name
FROM pg_index WHERE NOT indisvalid;  -- builds still in progress also show here

DROP INDEX CONCURRENTLY IF EXISTS idx_orders_created_at;
-- then re-run CREATE INDEX CONCURRENTLY (or REINDEX INDEX CONCURRENTLY on PG 12+)
```

## Tool-Specific Workflows

Always generate first, review the generated SQL for `DROP`, type changes and table rewrites, then apply (Ask First). Many tools turn a rename into drop + add, which deletes the column's data; hand-edit those into the expand/contract sequence.

| Tool | Generate | Renames | Never on shared DBs without Ask First |
|------|----------|---------|----------------------------------------|
| Prisma | `prisma migrate dev --create-only` (writes SQL, does not apply) only against a provably local, disposable DB: it connects, checks drift and can offer a reset. Otherwise generate SQL with `prisma migrate diff` (migrations directory → schema, `--script`, local shadow DB; flag names changed in Prisma 7, check `--help`) and save it as a new `migration.sql`. Apply with `prisma migrate deploy` | Field rename is generated as drop + add; keep the DB name with `@map`/`@@map` or hand-edit the SQL | `prisma migrate reset`; `prisma migrate dev` against anything but a disposable local DB (it can prompt to reset on drift); `prisma db push --accept-data-loss` |
| Alembic | `alembic revision --autogenerate -m "..."`; apply `alembic upgrade head` | Autogenerate does not detect renames (emits drop + add); hand-edit | `alembic downgrade` on shared DBs |
| Django | `python manage.py makemigrations`; inspect with `sqlmigrate`; apply `migrate` | Asks "Did you rename...?" only interactively for simple renames; with `--noinput` or combined changes it emits RemoveField + AddField | `python manage.py flush`; `migrate <app> zero` |
| Rails | `bin/rails generate migration ...` (hand-written); apply `bin/rails db:migrate` | No autodetect; `rename_column` is instant but breaks running code, so use expand/contract and `ignored_columns` before dropping | `db:reset`, `db:drop`, `db:schema:load`, `db:migrate:reset` |
| Flyway / Liquibase | Hand-written versioned SQL / changesets (`liquibase diff-changelog` can generate) | No autodetect; diff tools emit drop + add | `flyway clean`; `liquibase drop-all`; `liquibase rollback` |
| golang-migrate | `migrate create -ext sql -dir <dir> -seq <name>` (hand-written up/down) | No autodetect | `migrate drop`; `migrate down` without a count; `migrate force` (changes the version without running SQL) |
| TypeORM / Sequelize | `typeorm migration:generate`; `sequelize-cli migration:generate` (empty skeleton) | TypeORM generates drop + add; Sequelize is hand-written | `synchronize: true` / `sequelize.sync({ force: true })` / `sync({ alter: true })` outside local dev; `typeorm schema:drop`; `db:migrate:undo:all` |
| EF Core | `dotnet ef migrations add <Name>`; review with `dotnet ef migrations script` | Property rename is scaffolded as drop + add (with a data-loss warning); change it to `RenameColumn` or expand/contract | `dotnet ef database drop`; `dotnet ef database update 0`; `EnsureDeleted()` |

Generators that connect to the database (Prisma `migrate dev --create-only`, Alembic `--autogenerate`, TypeORM `migration:generate`) run without asking only when the configured database is provably local (`_shared/tool-rules.md` → Production Targets); otherwise show the resolved target and ask first, or point the generator at a local or disposable database.

If two branches add migrations in parallel, regenerate or reorder before merge so version numbers and dependencies stay linear (Alembic multiple heads, Django conflicting leaf nodes, Prisma/Flyway out-of-order versions).

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

Always know the recovery time objective (RTO) and recovery point objective (RPO) before running a risky migration. Down migrations and restores are Always Ask First: propose the exact steps and wait for approval.

### When Rollback Is Unsafe

Do not attempt a simple down migration if:

- New application code has already written data the old schema cannot represent
- A destructive change removed data that has no backup
- A migration touched multiple systems (database, cache, external store) inconsistently
- The migration ran partially and left data in an unknown state

In those cases, prefer forward-fix or a full restore instead.

## Verification

### Test Migrations Against Staging

Before production, run the migration against a staging database that mirrors production volume and schema. Staging is not provably local, so applying there follows Always Ask First (see Execution Boundary).

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
SELECT indexrelid::regclass AS index_name, indrelid::regclass AS table_name
FROM pg_index WHERE NOT indisvalid;

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
| Small (< 1M rows, < few GB) | Standard migration is usually fine; still set `lock_timeout`, since a hot small table blocks just as hard behind a long transaction |
| Large | Use concurrent index builds, batched backfills, NOT VALID + VALIDATE constraints, expand/contract, and a maintenance window for anything that rewrites the table |

### Online vs Offline Migration

| Scenario | Recommendation |
|----------|----------------|
| Add nullable column | Online with `ALTER TABLE` and `lock_timeout` (metadata-only) |
| Add `NOT NULL` column with constant default | Online on PostgreSQL 11+ (metadata-only) |
| Make existing column `NOT NULL` | Online in stages: batched backfill → `CHECK ... NOT VALID` → `VALIDATE` → `SET NOT NULL` (PG 12+) → drop CHECK |
| Rename column | Online via expand/contract, dual writes, parity check, contract in a later release |
| Drop unused column | Online after the Contract Gate passes |
| Change column type | Offline or expand/contract with a new column |
| Rebuild large table | Online with shadow table + cutover, or planned downtime |

## Execution Boundary

- **Runs without asking**: reading schema and migration files, generating or editing migration files, backfill scripts and runbooks (a generator that connects to a database only when that database is provably local), and read-only queries against a provably local database (`_shared/tool-rules.md` → Production Targets)
- **Always Ask First** (`_shared/tool-rules.md` → Always Ask First, also in `mode=auto`): applying migrations (up or down), any DDL or DML, backfills, drops, restores, any DB-resetting command in Tool-Specific Workflows, and any query against a database that is not provably local, including read-only ones (the long-transaction check, the dependents query, parity counts, `EXPLAIN`). Never use `EXPLAIN ANALYZE` on DML outside a local database: it executes the statement
- Treat the target database as production unless it is provably local (`_shared/tool-rules.md` → Production Targets). Read the connection string the tool will use (`DATABASE_URL`, `alembic.ini`, `settings.py`, `appsettings*.json`, `flyway.conf`, ...); a name containing dev/staging/test is not proof
- When asking, show: target host and database (credentials redacted), whether it is provably local, the exact command, the SQL it will run, the lock each statement takes, expected runtime, and backup status
- Never run DB-resetting or data-losing commands against a shared database, even when asked in passing; name the command and ask
- If an applied migration fails or times out, report it as "did not complete", record the state, and stop; do not retry destructive steps or roll back on your own

## Workflow

1. Inspect `.opencode/everything-backend-memory/` and existing migrations for the current schema, conventions and migration tool
2. Decide if the change is additive or requires expand/contract (use the plan from `backend-db-design` when one was handed over)
3. Classify each statement by the lock it takes and choose online vs offline
4. Generate or write the forward migration and a safe down migration with the project's tool; review generated SQL for drops and rewrites
5. Add `lock_timeout`/`statement_timeout` and non-transactional opt-outs where needed
6. Add idempotent, batched backfill scripts and parity checks if data must move
7. Ask First, then apply to a provably local or user-approved staging database and verify constraints, indexes, and query plans
8. Hand the user a runbook for production (order of releases, commands, timeouts, parity checks, rollback path); apply to production only on explicit approval
9. Schedule the contract step for a later release behind the Contract Gate and record it in `decisions.md`

## Concurrent & Partial Work

This skill participates in the shared checkpoint contract defined in `_shared/tool-rules.md` (Concurrent & Partial Work). See that document for checkpoint format, resume, rollback, multi-feature isolation, and partial completion rules.

**Migration-specific caveat**: migration checkpoints MUST be cleared only after the down migration (or rollback path) has been verified. Do not auto-delete a checkpoint on resume until the rollback path is proven safe.
