# Zero-Downtime DDL

Classify each statement by the lock it takes and how long it holds it, not by row count. PostgreSQL first; MySQL and MongoDB notes at the end.

## Lock and Statement Timeouts

Every `ALTER TABLE` needs a table lock, even when the change is metadata-only. On PostgreSQL a waiting `ACCESS EXCLUSIVE` request queues behind any open transaction on the table, and every later query on that table (plain `SELECT`s included) queues behind the DDL. One long-running transaction can turn an instant DDL into an outage.

Before running DDL, check for long transactions (this is a query: on a non-local database it is Always Ask First):

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

- Keep the short `lock_timeout` for statements that take `ACCESS EXCLUSIVE` or `SHARE` locks (most `ALTER TABLE`, plain `CREATE INDEX`, `ADD CONSTRAINT ... NOT VALID`).
- On a `lock_timeout` error, retry with backoff (for example 5 attempts, doubling a 2s wait). Build that retry into the migration script or runbook the user approved. The agent itself does not re-run a failed apply without asking again.
- If the migration runs inside a single transaction, a `lock_timeout` failure rolls back cleanly. Otherwise (concurrent index builds, tools that run statements one by one, all MySQL DDL, which commits implicitly) check what was applied before retrying.
- For long but weakly locking statements (`CREATE INDEX CONCURRENTLY`, `REINDEX CONCURRENTLY`, `DROP INDEX CONCURRENTLY`, `VALIDATE CONSTRAINT`), raise `lock_timeout` for that statement (for example `'0'` or a few minutes) and raise or disable `statement_timeout`. They wait for older transactions and conflicting locks, but while waiting they do not block normal reads and writes (only other DDL and autovacuum on that table). Run the long-transaction check first. After any timeout or cancel of a concurrent build, run the INVALID-index query below and drop the invalid index before retrying.
- Batched backfills: keep `lock_timeout` short (row locks) and bound each batch with `statement_timeout`.
- These are database-side limits. The agent never kills a running migration itself (`<shared>/tool-rules.md` -> Command Time Budgets).

## Adding NOT NULL

New column with a constant default (PostgreSQL 11+): metadata-only, no table rewrite and no scan.

```sql
ALTER TABLE users ADD COLUMN loyalty_tier INT NOT NULL DEFAULT 1;
```

This holds for non-volatile defaults only. A volatile default (`gen_random_uuid()`, `clock_timestamp()`, `random()`) rewrites the whole table under `ACCESS EXCLUSIVE`. Instead add the column nullable, set the default for new rows, batch-backfill, then follow the existing-column path. Before PostgreSQL 11 any default rewrites the table.

Existing column: first make sure the application already writes non-NULL values (the NOT VALID check is enforced for new writes immediately). Run steps 2 and 3 in separate migrations or transactions: if `VALIDATE` runs in the same transaction as `ADD CONSTRAINT`, the `ACCESS EXCLUSIVE` lock is held for the whole scan.

```sql
-- 1. batched backfill until no NULLs remain (see backfills.md)
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

On PostgreSQL 11 and older, step 4 scans the whole table under `ACCESS EXCLUSIVE`. Keep the validated CHECK instead of `SET NOT NULL` on large tables.

## Adding Constraints Without Long Locks

- CHECK and FOREIGN KEY: `ADD CONSTRAINT ... NOT VALID` (short lock, no scan), then `VALIDATE CONSTRAINT` in a separate transaction (scans without blocking writes).
- UNIQUE and PRIMARY KEY: `CREATE UNIQUE INDEX CONCURRENTLY`, then `ALTER TABLE ... ADD CONSTRAINT <name> UNIQUE USING INDEX <index>` (or `PRIMARY KEY USING INDEX`). For `PRIMARY KEY`, first make the columns `NOT NULL` via the CHECK path above; otherwise `USING INDEX` runs an implicit `SET NOT NULL` that scans the table under `ACCESS EXCLUSIVE`.
- PostgreSQL does not index referencing (FK) columns automatically. Add the index concurrently if parents are deleted or updated, or joins use it.

## Index Creation Concurrently

Plain `CREATE INDEX` blocks writes for the whole build. On existing PostgreSQL tables use concurrent builds:

```sql
CREATE INDEX CONCURRENTLY idx_orders_created_at ON orders (created_at);
```

- `CREATE INDEX CONCURRENTLY`, `DROP INDEX CONCURRENTLY` and `REINDEX CONCURRENTLY` cannot run inside a transaction block. Use the migration tool's per-migration opt-out ([tools.md](tools.md)). Never fix the error by dropping `CONCURRENTLY`.
- Put one concurrent statement per migration file: a multi-statement script sent in one call runs as an implicit transaction on PostgreSQL.
- A failed or cancelled concurrent build raises an error and leaves an INVALID index that still slows writes. Find it, drop it, retry:

```sql
SELECT indexrelid::regclass AS index_name, indrelid::regclass AS table_name
FROM pg_index WHERE NOT indisvalid;  -- builds still in progress also show here

DROP INDEX CONCURRENTLY IF EXISTS idx_orders_created_at;
-- then re-run CREATE INDEX CONCURRENTLY (or REINDEX INDEX CONCURRENTLY on PG 12+)
```

## Decision Tables

| Table size | Approach |
|------------|----------|
| Small (under about 1M rows and a few GB) | Standard migration is usually fine; still set `lock_timeout`, since a hot small table blocks just as hard behind a long transaction |
| Large | Concurrent index builds, batched backfills, NOT VALID + VALIDATE, expand/contract, and a maintenance window for anything that rewrites the table |

| Change | Recommendation |
|--------|----------------|
| Add nullable column | Online, `ALTER TABLE` with `lock_timeout` (metadata-only) |
| Add `NOT NULL` column with constant default | Online on PostgreSQL 11+ (metadata-only) |
| Make existing column `NOT NULL` | Online in stages: batched backfill, CHECK NOT VALID, VALIDATE, SET NOT NULL (PG 12+), drop CHECK |
| Rename column | Online via expand/contract with dual-write ([expand-contract.md](expand-contract.md)) |
| Drop unused column | Online after the Contract Gate passes; one-way |
| Change column type | Expand/contract with a new column, or offline; most type changes rewrite the table |
| Rebuild or repack a bloated large table | Online with `pg_repack` (an extension; Ask First) or a shadow table and cutover, or planned downtime |

## MySQL

- DDL commits implicitly; a failed multi-statement migration leaves earlier statements applied.
- State the algorithm explicitly (`ALGORITHM=INSTANT`, or `ALGORITHM=INPLACE, LOCK=NONE`) so the statement fails instead of silently falling back to a blocking table copy.
- `SET SESSION lock_wait_timeout = 5;` (seconds; the default is one year). Metadata locks queue like PostgreSQL locks, so check `information_schema.innodb_trx` and `SHOW PROCESSLIST` for long transactions first.
- For large tables where only a copy works, use gh-ost or pt-online-schema-change.

## MongoDB

- There is no DDL lock problem, but shape changes still need expand/contract: add the new field, dual-write, backfill in batches with `updateMany` on bounded `_id` ranges, then remove the old field later.
- For lazy migration, store a `schemaVersion` on each document and upgrade documents on read or write; keep readers able to handle every live version.
- Build indexes on large collections during low traffic and watch replication lag; JSON Schema validators should be added with `validationLevel: "moderate"` first.
