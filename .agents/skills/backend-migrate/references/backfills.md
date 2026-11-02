# Data Backfills

Backfills must not hold long transactions or lock many rows at once. Running one against a non-local database is Always Ask First.

## Batching (keyset)

Walk the table by a unique, indexed key and commit after each batch. This works for integer and UUID keys alike.

```sql
-- :last_id starts below the smallest key: 0 for integers,
-- '00000000-0000-0000-0000-000000000000' for UUIDs
WITH batch AS (
  SELECT id FROM users
  WHERE id > :last_id AND legacy_id IS NULL
  ORDER BY id
  LIMIT 5000
)
UPDATE users u
SET legacy_id = gen_random_uuid()   -- built in on PostgreSQL 13+; pgcrypto before that
FROM batch
WHERE u.id = batch.id
RETURNING u.id;
-- next :last_id = max(returned id); stop when 0 rows return
```

Rules:

- Start with 1,000 to 10,000 rows per batch and tune by observed lock time and replication lag.
- Commit after each batch. Sleep briefly between batches to yield CPU, I/O and replicas.
- Order by a unique key. If you must walk a non-unique column such as `created_at`, use the tuple `(created_at, id)` as the cursor, or rows with equal timestamps get skipped.
- Do not use `id <= :cursor + :batch_size` arithmetic: it breaks on UUIDs and on gaps.
- Bound each batch with `statement_timeout` and keep `lock_timeout` short ([zero-downtime.md](zero-downtime.md)).
- Start the backfill only after dual-write is live on every instance, or rows written in between are missed.
- `:last_id` and the batch size are bound parameters, never text spliced into the SQL. The same goes for every example in these references.

## Dynamic SQL in Migrations and Backfills

Migrations and backfills are code too: `<shared>/sql-safety.md` rules 1, 2 and 8 apply in full. A backfill often reads values from the database (tenant schema names, lookup values, old column contents); treat those as untrusted too (second-order injection).

- **Values:** bound parameters only. In application code use the driver's placeholders; in PL/pgSQL use `EXECUTE ... USING`.
- **Identifiers** (table, column, schema names that vary per run, such as partitions or schema-per-tenant loops): take them from a fixed list in the migration or from the catalog, check them against an allowlist or pattern, then quote with `format('%I', ...)`, psycopg `sql.Identifier`, `pgx.Identifier{...}.Sanitize()` or the tool's identifier quoting.
- **Literals in DDL** that cannot take a parameter (`SET DEFAULT`, `COMMENT ON`, `CHECK` bodies): use `format('%L', value)` or a constant written in the migration file. Never concatenate.
- **Never** `EXECUTE 'UPDATE ' || tbl || ' SET status = ''' || v || ''''`, f-strings, template literals, `Sprintf` or `+` into SQL text, even when the value "comes from our own table".
- Tool raw-SQL hooks (`op.execute`, `migrationBuilder.Sql`, `knex.raw`, `queryRunner.query`, `execute` in Rails) take constant SQL or bound parameters only; see the unsafe-API table in `<shared>/sql-safety.md`.

PL/pgSQL loop over partitions or tenant schemas:

```sql
DO $$
DECLARE
  s text;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace
    WHERE nspname ~ '^tenant_[a-z0-9_]{1,40}$'   -- allowlist pattern, checked before use
  LOOP
    EXECUTE format(
      'UPDATE %I.orders SET status = $1 WHERE status = $2 AND id IN (
         SELECT id FROM %I.orders WHERE status = $2 ORDER BY id LIMIT 5000)',
      s, s)
    USING 'archived', 'closed';
  END LOOP;
END $$;
```

Application-code backfill (Python, psycopg 3), with the batch shown above:

```python
from psycopg import sql

ALLOWED_TABLES = {"users", "customers"}  # fixed in code, never from input

def backfill_batch(conn, table: str, last_id, batch_size: int = 5000):
    if table not in ALLOWED_TABLES:
        raise ValueError(f"table not allowed: {table!r}")
    query = sql.SQL("""
        WITH batch AS (
          SELECT id FROM {t}
          WHERE id > %s AND legacy_id IS NULL
          ORDER BY id LIMIT %s
        )
        UPDATE {t} u SET legacy_id = gen_random_uuid()
        FROM batch WHERE u.id = batch.id
        RETURNING u.id
    """).format(t=sql.Identifier(table))
    with conn.transaction():
        return [r[0] for r in conn.execute(query, (last_id, batch_size)).fetchall()]
```

Trigger functions used for dual-write follow the same rule: no `EXECUTE` built from strings. If a trigger or helper function is `SECURITY DEFINER`, give it a fixed `search_path` (`SET search_path = pg_catalog, <schema>`) and do not grant `EXECUTE` on it to `PUBLIC`.

Before reporting a migration or backfill done, run the Verification steps in `<shared>/sql-safety.md` over the migration files and backfill scripts (static search and reading every file at minimum).

## Idempotency

Backfill scripts must be safe to rerun. Filter on the target state so finished rows are skipped:

```sql
UPDATE orders
SET normalized_email = lower(email)
WHERE id IN (
  SELECT id FROM orders
  WHERE id > :last_id AND normalized_email IS DISTINCT FROM lower(email)
  ORDER BY id LIMIT 5000
);
```

Running it twice changes nothing.

## Progress Tracking

This is a database-side cursor for resuming the job. It is not the agent checkpoint (that lives in the memory folder).

```sql
CREATE TABLE migration_progress (
  migration_name TEXT PRIMARY KEY,
  last_cursor    TEXT NOT NULL,          -- store the key as text; cast back to its type when reading
  rows_done      BIGINT NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ
);
```

For large jobs, log per-batch metrics (rows processed, duration, errors) and alert on failure. Drop the progress row or table in the contract release.

## Where Backfills Live

Prefer a standalone script or job (for example `scripts/backfills/<slug>.<ext>` or the framework's task runner, such as a Rails rake task or a Django management command) over a schema migration. A schema migration that loops over millions of rows blocks the deploy and holds the migration lock. Follow the project's existing convention if it has one.

## Backfill Rollback

Stop a bad backfill immediately. For destructive transforms, keep the original column until the backfill is validated by the parity check. Then correct affected rows from the original column, or restore from backup (Always Ask First).
