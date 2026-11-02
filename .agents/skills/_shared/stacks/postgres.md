# PostgreSQL Stack Reference

Shared reference for skills working on a PostgreSQL project: backend-db-design, backend-migrate, backend-implement, backend-test, backend-ops, backend-doctor, backend-debug and backend-security. It is a cheat sheet, not a workflow. The owning skill's SKILL.md decides what to do; this file says how to do it safely in PostgreSQL.

Precedence: `_shared/tool-rules.md` (mode=auto contract, approvals) always wins; if this file and backend-migrate disagree on a migration rule, backend-migrate wins. Project decisions recorded in `decisions.md` win over the defaults here.

## Version Notes

- Use a currently supported major version (each major gets 5 years of fixes). Prefer the latest stable major for new projects. Check the project's real version with `SELECT version();` or `SHOW server_version_num;` before relying on a feature.
- Match the major version across local, CI, staging and production. Pin the same major in Docker images and Testcontainers.
- Version-gated features used in this file:

| Feature | Available from |
|---------|----------------|
| `ADD COLUMN ... DEFAULT <constant>` without table rewrite | 11 |
| `SET NOT NULL` skips the scan when a valid `CHECK (col IS NOT NULL)` exists | 12 |
| `REINDEX CONCURRENTLY`, generated columns | 12 |
| `DETACH PARTITION ... CONCURRENTLY` | 14 |
| `UNIQUE NULLS NOT DISTINCT`, `MERGE` | 15 |
| Built-in `uuidv7()` | 18 |

If a feature is not available on the project's version, say so and use the fallback (for example generate UUIDv7 in the application).

## Schema Conventions

| Topic | Default | Notes |
|-------|---------|-------|
| Primary key | `bigint GENERATED ALWAYS AS IDENTITY` | Use over `serial`. Use UUIDv7 when IDs are exposed publicly, generated client-side, or merged across databases |
| UUID keys | `uuid` column, UUIDv7 values | Time-ordered, so btree inserts stay local. Avoid random UUIDv4 as a clustered-style PK on large, write-heavy tables |
| Timestamps | `timestamptz` | Never `timestamp` without time zone for events. Store UTC; convert at the edge |
| Strings | `text` + `CHECK (char_length(col) <= n)` | `varchar(n)` is fine too; no performance difference. Raising a `varchar` limit or `varchar` -> `text` needs no rewrite |
| Money | `numeric(precision, scale)` or integer minor units (`bigint` cents) | Never `float`/`double precision`/`money`. Store currency code next to the amount |
| Booleans | `boolean NOT NULL DEFAULT false` | Avoid nullable three-state flags unless NULL means something |
| Enums | `text` + `CHECK (col IN (...))` or a lookup table | Native `enum` values can be added but not removed or reordered easily |
| JSON | `jsonb` | Only for truly schemaless data. Index with GIN if queried |
| Names | `snake_case`, plural tables, `<table>_id` FKs | Name constraints and indexes explicitly: `orders_customer_id_fkey`, `idx_orders_customer_id` |
| Audit columns | `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at` | Set `updated_at` in the app or a trigger, consistently |

Rules:

- Every foreign key column gets an index. PostgreSQL does not create one, and missing FK indexes cause slow deletes and lock pile-ups on the parent.
- Put invariants in the database: `NOT NULL`, `CHECK`, `UNIQUE`, FKs. Application checks alone race.
- Soft deletes: add a partial unique index that ignores deleted rows, for example `CREATE UNIQUE INDEX ... ON users (email) WHERE deleted_at IS NULL`.

```sql
CREATE TABLE orders (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id    bigint NOT NULL REFERENCES tenants (id),
  customer_id  bigint NOT NULL REFERENCES customers (id),
  status       text   NOT NULL CHECK (status IN ('pending','paid','cancelled')),
  total_cents  bigint NOT NULL CHECK (total_cents >= 0),
  currency     char(3) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_customer_id ON orders (customer_id);  -- new table: plain CREATE INDEX is fine
```

## Indexing

| Type | Use for | Example |
|------|---------|---------|
| btree (default) | Equality, ranges, `ORDER BY`, `LIKE 'abc%'` (with `text_pattern_ops` or C collation) | `CREATE INDEX ... ON orders (tenant_id, created_at DESC)` |
| GIN | `jsonb` containment, arrays, full-text `tsvector`, trigram (`pg_trgm`) search | `CREATE INDEX ... USING gin (attrs jsonb_path_ops)` |
| GiST | Ranges, geometry (PostGIS), exclusion constraints, nearest-neighbour | `EXCLUDE USING gist (room_id WITH =, during WITH &&)` (needs `btree_gist`) |
| BRIN | Very large append-only tables where the column follows physical order (time series) | `CREATE INDEX ... USING brin (created_at)` |
| Partial | Hot subset of rows | `... ON jobs (run_at) WHERE status = 'queued'` |
| Covering | Index-only scans | `... ON orders (customer_id) INCLUDE (status, total_cents)` |
| Expression | Queries on a computed value | `... ON users (lower(email))`; queries must use the same expression |

Rules:

- Composite index column order: equality columns first, then range or sort columns. `(tenant_id, created_at)` serves `WHERE tenant_id = $1 ORDER BY created_at`.
- Each index slows writes and uses memory. Remove unused ones (check `pg_stat_user_indexes.idx_scan = 0` over a full business cycle, on every replica that serves reads, before dropping).
- On existing tables with traffic, always use `CREATE INDEX CONCURRENTLY` (and `DROP INDEX CONCURRENTLY`, `REINDEX ... CONCURRENTLY`):
  - It cannot run inside a transaction block. Use the migration tool's opt-out (see `backend-migrate/references/zero-downtime.md` -> Index Creation Concurrently). Never fix the error by removing `CONCURRENTLY`.
  - It waits for older transactions. Check for long-running transactions first (query in Query Diagnosis).
  - If it fails or is cancelled, it leaves an INVALID index. Find and drop it, then retry:

```sql
SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
DROP INDEX CONCURRENTLY IF EXISTS idx_orders_created_at;
```

## Safe Migration Cheat Sheet

Follows backend-migrate (expand -> dual-write -> backfill -> switch reads -> contract). Lock levels for common DDL:

| Operation | Lock | Blocks | Safe pattern |
|-----------|------|--------|--------------|
| `ADD COLUMN` nullable, or with constant default (11+) | ACCESS EXCLUSIVE, brief | Everything, briefly | Fine with `lock_timeout` |
| `ADD COLUMN` with volatile default (`now()`, `gen_random_uuid()`) | ACCESS EXCLUSIVE + rewrite | Everything, long | Add nullable, set default, batch-backfill |
| `ALTER COLUMN TYPE` | ACCESS EXCLUSIVE + usually rewrite | Everything, long | New column + expand/contract. Binary-coercible changes (for example `varchar(n)` -> `text`) skip the rewrite |
| `SET NOT NULL` | ACCESS EXCLUSIVE + full scan | Everything | `CHECK ... NOT VALID` -> `VALIDATE` -> `SET NOT NULL` (12+) |
| `ADD CONSTRAINT CHECK ... NOT VALID` | ACCESS EXCLUSIVE, brief | Everything, briefly | Then `VALIDATE` in a separate transaction |
| `ADD FOREIGN KEY ... NOT VALID` | SHARE ROW EXCLUSIVE on both tables, brief | Writes, briefly | Then `VALIDATE` separately |
| `VALIDATE CONSTRAINT` | SHARE UPDATE EXCLUSIVE (+ ROW SHARE on referenced table) | Other DDL, vacuum | Raise `statement_timeout` for this statement |
| `CREATE INDEX` | SHARE | Writes, for the whole build | Use `CONCURRENTLY` |
| `CREATE INDEX CONCURRENTLY` | SHARE UPDATE EXCLUSIVE | Other DDL, vacuum | Outside a transaction |
| `ADD UNIQUE / PRIMARY KEY` | ACCESS EXCLUSIVE + index build | Everything | Build unique index concurrently, then `ADD CONSTRAINT ... USING INDEX` (for a PK, make columns NOT NULL first) |
| `RENAME COLUMN / TABLE` | ACCESS EXCLUSIVE, brief | Everything, briefly | Breaking for running code: use expand/contract |
| `DROP COLUMN` | ACCESS EXCLUSIVE, brief | Everything, briefly | Only in the contract phase, after no code reads it |
| `ENABLE / FORCE ROW LEVEL SECURITY`, `CREATE POLICY` | ACCESS EXCLUSIVE, brief | Everything, briefly | Deploy policies before code depends on them |

Session settings for every migration:

```sql
SET lock_timeout = '5s';          -- give up waiting for a lock instead of queueing traffic behind it
SET statement_timeout = '15min';  -- bound runaway statements
```

For `VALIDATE` and `CONCURRENTLY` statements, raise both `lock_timeout` and `statement_timeout` for that statement only: they wait for older transactions but do not block normal reads and writes (backend-migrate has the details).

A waiting `ACCESS EXCLUSIVE` request blocks every later query on the table, even plain `SELECT`s. That is why `lock_timeout` matters even for "instant" DDL. On timeout, retry with backoff via the approved script or runbook; the agent does not re-run a failed apply without asking.

Safe NOT NULL on an existing column (steps 2 and 3 in separate transactions):

```sql
-- 1. app writes non-NULL values; batch-backfill until 0 NULLs remain
ALTER TABLE users ADD CONSTRAINT users_tier_not_null CHECK (tier IS NOT NULL) NOT VALID;  -- 2
ALTER TABLE users VALIDATE CONSTRAINT users_tier_not_null;                                -- 3
ALTER TABLE users ALTER COLUMN tier SET NOT NULL;   -- 4. no scan on 12+, uses the valid CHECK
ALTER TABLE users DROP CONSTRAINT users_tier_not_null;                                    -- 5
```

Batched backfill (idempotent, resumable, one transaction per batch):

```sql
UPDATE users SET tier = 'standard'
WHERE id IN (SELECT id FROM users WHERE tier IS NULL AND id > :cursor ORDER BY id LIMIT 5000)
RETURNING id;  -- set :cursor to the max returned id
-- commit, sleep briefly, repeat until 0 rows; watch replication lag; finish with SELECT count(*) ... WHERE tier IS NULL
```

Run migrations on a direct connection (not through PgBouncer in transaction mode), so session settings and `CONCURRENTLY` behave as expected.

## Multi-Tenancy

Shared-schema model:

- Every tenant-owned table has `tenant_id NOT NULL`. Lead indexes and unique constraints with it: `UNIQUE (tenant_id, email)`.
- Use composite FKs so a row cannot point at another tenant's row (on existing tables, use the concurrent unique-index and `NOT VALID` patterns above):

```sql
ALTER TABLE customers ADD CONSTRAINT customers_tenant_id_id_key UNIQUE (tenant_id, id);
ALTER TABLE orders ADD CONSTRAINT orders_customer_fkey
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers (tenant_id, id);
```

Row-Level Security as defense in depth (application authz still filters by tenant):

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;  -- owner is subject to policies too
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::bigint);
```

- Superusers and roles with `BYPASSRLS` skip policies. The app role must have neither, and should not own the tables.
- With a pooler, set the tenant per transaction, never per session:

```sql
BEGIN;
SELECT set_config('app.tenant_id', $1, true);  -- $1 = tenant from the verified token; true = transaction-local
-- queries
COMMIT;
```

  A session-level `SET app.tenant_id` leaks to the next client that gets the pooled connection.
- If `app.tenant_id` is unset, `current_setting(..., true)` returns NULL, or `''` on a connection that set it earlier (hence `nullif`), and the policy matches no rows. Test that case.
- Test isolation: as tenant A, read, update and delete tenant B's rows by ID; expect zero rows affected.
- RLS does not replace the owner predicate in queries (`_shared/sql-safety.md` rule 3). Keep `AND tenant_id = $n` in every query; RLS catches the one you forget. The tenant value always comes from the authenticated principal, never from the request body, path or query string.

## Safe Query Patterns

Rules and verification live in `_shared/sql-safety.md`. These are the Postgres forms of them. `$n` is a bound parameter; the owner parameter comes from the authenticated principal.

```sql
-- Owner-scoped read and write. Zero rows -> 404, never a fallback query without the owner.
SELECT id, status, total_cents FROM orders WHERE id = $1 AND tenant_id = $2;
UPDATE orders SET status = $3 WHERE id = $1 AND tenant_id = $2 RETURNING id;
DELETE FROM orders WHERE id = $1 AND tenant_id = $2;

-- Lists: one array parameter (length capped in the app), never ids joined into the text.
SELECT id, status FROM orders WHERE tenant_id = $1 AND id = ANY($2::bigint[]);

-- Search: the app escapes \ % _ in the term, then binds it.
SELECT id, name FROM customers
WHERE tenant_id = $1 AND name ILIKE '%' || $2 || '%' ESCAPE '\'
ORDER BY name LIMIT 50;
```

- Sort columns and direction cannot be bound. The application maps the client's value through a fixed allowlist to a constant SQL fragment (examples in `node-typescript.md` and `python-fastapi.md` -> Data Access Safety) and rejects anything else with 400.
- Pagination: bind `LIMIT` and `OFFSET` (or the keyset cursor) as parameters and cap the limit in the app.
- Dynamic SQL in PL/pgSQL: allowlist the identifier, quote it with `format('%I')`, and pass values with `USING`. Never `EXECUTE '...' || value`.

```sql
CREATE FUNCTION app.count_owned(p_table text, p_tenant bigint) RETURNS bigint
LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
DECLARE n bigint;
BEGIN
  IF p_table NOT IN ('orders', 'customers') THEN   -- allowlist first
    RAISE EXCEPTION 'table not allowed: %', p_table;
  END IF;
  EXECUTE format('SELECT count(*) FROM app.%I WHERE tenant_id = $1', p_table)
    INTO n USING p_tenant;                          -- value bound, identifier quoted
  RETURN n;
END $$;
```

## Connection Pooling

- Size the pool from the database side: total connections across all app instances, workers and cron jobs must stay below `max_connections` minus reserved admin slots. Many small pools add up.
- Use PgBouncer (or a managed equivalent) when there are many app instances or serverless functions.

| PgBouncer mode | Notes |
|----------------|-------|
| session | Safe for everything; little multiplexing |
| transaction | Best multiplexing. Breaks session state (see caveats) |
| statement | No multi-statement transactions; rarely appropriate |

Transaction-mode caveats:

- No session-level `SET`, session advisory locks (`pg_advisory_lock`), `LISTEN`, temp tables that outlive a transaction, or `WITH HOLD` cursors. Use `SET LOCAL` / `set_config(..., true)` and `pg_advisory_xact_lock`.
- Prepared statements: recent PgBouncer releases track protocol-level prepared statements when `max_prepared_statements` is set. Otherwise disable them in the driver (for example Prisma `pgbouncer=true`, asyncpg `statement_cache_size=0`).
- Point migrations, `LISTEN/NOTIFY` consumers and long admin jobs at the direct port.
- Set driver timeouts: connect timeout, query/statement timeout, and idle timeout below the pooler's server idle timeout.

## Query Diagnosis

Warning: `EXPLAIN ANALYZE` executes the query. For `INSERT`, `UPDATE`, `DELETE` or functions with side effects, wrap it and roll back, and never run it against production without approval:

```sql
EXPLAIN SELECT ...;                                  -- plan only, does not execute
BEGIN; EXPLAIN (ANALYZE, BUFFERS) UPDATE ...; ROLLBACK;
```

What to look for: `Seq Scan` on large tables with selective filters, estimated vs actual row counts off by 10x or more (run `ANALYZE <table>`), `Rows Removed by Filter` much larger than rows returned, nested loops over large inputs, sorts spilling to disk (`external merge`).

Useful queries:

```sql
-- top queries by total time (needs pg_stat_statements in shared_preload_libraries + CREATE EXTENSION)
SELECT calls, round(total_exec_time) AS total_ms, round(mean_exec_time, 1) AS mean_ms, query
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;

-- long-running and idle-in-transaction sessions
SELECT pid, state, now() - xact_start AS xact_age, wait_event_type, left(query, 120)
FROM pg_stat_activity WHERE xact_start IS NOT NULL ORDER BY xact_start;

-- who blocks whom
SELECT pid, pg_blocking_pids(pid) AS blocked_by, left(query, 120)
FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid)) > 0;
```

- `auto_explain` logs plans of slow queries automatically: set `auto_explain.log_min_duration` (for example `500ms`). Keep `log_analyze` off in production unless sampling, as it adds overhead.
- N+1 detection: high `calls` with a low `mean_exec_time` for the same query shape.
- Set `idle_in_transaction_session_timeout` so stuck transactions do not hold locks or block vacuum.

## Vacuum and Bloat

- MVCC leaves dead tuples on every `UPDATE` and `DELETE`. Autovacuum removes them and updates statistics. Never disable it.
- Signs of trouble: `n_dead_tup` high in `pg_stat_user_tables`, `last_autovacuum` old, table size growing with stable row count.
- Long-running transactions and abandoned replication slots stop vacuum from cleaning up. Check `pg_stat_activity` and `pg_replication_slots`.
- For hot tables, tune per table: `ALTER TABLE events SET (autovacuum_vacuum_scale_factor = 0.02);`
- Transaction ID wraparound: monitor `age(datfrozenxid)` per database; alert well before the autovacuum freeze limits.
- `VACUUM FULL` and `CLUSTER` take ACCESS EXCLUSIVE and rewrite the table. Use `pg_repack` (extension) for online rebuilds, with approval.

## Backups and Restore

| Method | What it gives | Use for |
|--------|---------------|---------|
| `pg_dump` / `pg_restore` (`-Fc` or `-Fd`) | Logical snapshot of one database | Small databases, migrations between versions, per-table exports. Not PITR |
| Base backup + WAL archiving | Physical copy + continuous WAL | Point-in-time recovery (PITR) to any moment |
| pgBackRest (or similar tools) | Full/diff/incremental base backups, WAL archive, retention, encryption, parallel restore | Self-managed production |
| Managed service snapshots + PITR | Provider-handled | Managed Postgres; confirm retention and cross-region copy |

Rules:

- `pg_dumpall --globals-only` is needed in addition to `pg_dump` to keep roles and tablespaces.
- Store backups in another account or region, encrypted, with retention that meets the RPO/RTO in `deployment.md`.
- A backup is only proven by a restore. Schedule restore drills: restore into an isolated instance, run row-count and checksum queries on key tables, run the app's smoke tests, and record the time taken (actual RTO) in a runbook (`docs/runbooks/`).
- Take a fresh backup or confirm PITR coverage before destructive migrations (contract phase, drops).
- Restores and PITR are production actions: backend-ops plans them, the user approves them.

## Local and Test Setup

```bash
docker run --name pg-dev -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=app \
  -p 5432:5432 -d postgres:<major>   # use the same major as production
```

- Tests: prefer Testcontainers (available for Node, Python, Java, Go, .NET) with the production major version, over SQLite or in-memory fakes. Behavior differs in locking, types, constraints and JSON.
- Speed: one container per test run, migrations applied once, then per-test isolation by transaction rollback, `TRUNCATE ... RESTART IDENTITY CASCADE` of touched tables, or a template database (`CREATE DATABASE test_n TEMPLATE app_template`).
- Run the real migration files in tests, not a schema dump, so migrations are tested too.
- Local passwords like `devpass` are for local containers only. Never reuse them anywhere else; keep real values out of the repo (`.env.example` documents names only).

## Security

- Roles, least privilege:

| Role | Rights |
|------|--------|
| Owner / migration role | Owns schema objects; used only by migrations |
| App role | `CONNECT`, `USAGE` on schema, `SELECT/INSERT/UPDATE/DELETE` on needed tables, `USAGE` on sequences. No `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `BYPASSRLS` |
| Read-only role | `SELECT` only; for reporting and support |

```sql
REVOKE CREATE ON SCHEMA public FROM PUBLIC;   -- needed before PG 15; 15+ already revokes it
GRANT USAGE ON SCHEMA app TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO app_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
```

- Never run the application as a superuser or as the table owner (owners bypass RLS unless `FORCE` is set).
- Require TLS: `sslmode=verify-full` (or at least `require`) in connection strings for non-local databases; `hostssl` rules in `pg_hba.conf`; use `scram-sha-256`, not `md5` or `trust`.
- Injection-proof queries are mandatory: follow `_shared/sql-safety.md` (rules, per-driver safe APIs, verification). Never build SQL by string concatenation. Postgres-specific patterns are in Safe Query Patterns below.
- `SECURITY DEFINER` functions: set `search_path` explicitly (`SET search_path = app, pg_temp`) and grant `EXECUTE` narrowly (`REVOKE EXECUTE ... FROM PUBLIC` first).
- Do not grant the app role `pg_read_server_files`, `pg_write_server_files` or `pg_execute_server_program`; they turn an injection into file access or command execution. Set a role-level timeout so one crafted query cannot hold connections: `ALTER ROLE app_rw SET statement_timeout = '5s';`.
- `pgcrypto`: `gen_random_bytes`, `crypt()` with `gen_salt('bf')` exist, but prefer hashing passwords in the application (argon2id/bcrypt) and encrypting sensitive fields with app-managed keys. Do not put keys in SQL or migration files.
- Keep credentials in a secret manager or environment, rotate them, and give each service its own role so access can be audited and revoked.
- Enable `log_connections` and audit logging (for example the `pgaudit` extension) where compliance requires it.

## Observability Checklist

- [ ] `pg_stat_statements` enabled; top queries by total time reviewed regularly
- [ ] Slow query logging: `log_min_duration_statement` set (for example 500ms to 1s); `auto_explain` for plans
- [ ] `log_lock_waits = on`, `deadlock_timeout` default or tuned; deadlocks alerted
- [ ] Connections: active, idle, idle in transaction vs `max_connections`; pool wait time in the app
- [ ] Replication lag (bytes and seconds) per replica; inactive replication slots alerted
- [ ] Cache hit ratio, disk usage and growth, WAL volume
- [ ] Dead tuples, last autovacuum per hot table, `age(datfrozenxid)` (wraparound)
- [ ] Long-running transactions and blocked queries (`pg_blocking_pids`)
- [ ] Backup success, last successful backup age, WAL archive failures, last restore drill date
- [ ] Unused and invalid indexes reviewed (`pg_stat_user_indexes`, `pg_index.indisvalid`)
- [ ] Exporter or managed metrics wired to dashboards and alerts (see backend-ops)
