# Rollback and Verification

## Down Migrations

Write a down migration for every forward migration when the tool supports it. Be honest about what it can undo:

| Forward change | Down migration | Label |
|----------------|----------------|-------|
| Add column, table, index, constraint | Drop it | reversible |
| Relax a constraint (DROP NOT NULL) | Re-add it with the safe NOT NULL path; fails if NULLs were written | reversible with care |
| Backfill into a new column | Clear the new column, or nothing | reversible while the old data exists |
| Drop column, table, or data; lossy type change | Can recreate the structure, NOT the data | one-way |

```sql
-- up
ALTER TABLE users ADD COLUMN phone TEXT;

-- down
ALTER TABLE users DROP COLUMN phone;
```

Mark one-way migrations in a comment at the top of the file and in the phase plan, for example `-- ONE-WAY: data in users.email is not restored by down`. A one-way step needs the backup gate (see expand-contract.md -> Contract Gate).

## Restore Strategies

- Reverse or forward-fix: run the down migration or a new forward-fix migration, then repair data from a retained column or table.
- Logical restore: reload affected tables from a logical dump (for example `pg_dump` of those tables) taken before the change.
- Snapshot restore: restore from a backup taken before the migration.
- Point-in-time recovery (PITR): replay continuous backups to a known good moment.

Know the recovery time objective (RTO) and recovery point objective (RPO) before any risky migration. Backup, PITR and restore drills are owned by backend-ops; point the user there if none exist. Down migrations and restores are Always Ask First: propose the exact steps and wait for approval.

## When Rollback Is Unsafe

Do not run a simple down migration if:

- New application code has already written data the old schema cannot represent.
- A destructive change removed data that has no backup.
- The migration touched multiple systems (database, cache, external store) inconsistently.
- The migration ran partially and left data in an unknown state.

Prefer a forward-fix migration or a full restore instead.

## Applied Migrations vs File Rollback

Reverting files (checkpoint rollback) does not undo a migration already applied to a database. After any apply, record the migration IDs and target in the phase plan. To undo an applied migration, run its down migration or a forward-fix migration (Always Ask First), then revert files only if the user wants that too.

## Verification

### Local, before anyone else's database (runs without asking on a disposable DB)

On a disposable database this run started (Testcontainers, a local container it launched, a temp SQLite file) or the tool's shadow database on a provably local server. A provably local database that this run did not start (for example the developer's own dev database) still holds data: applying or reverting migrations there is Always Ask First (`<shared>/tool-rules.md` -> Always Ask First).

1. Apply all migrations from scratch, or from the current production version if a schema dump is available.
2. Run up, then down, then up again for the new migrations. A one-way down is checked only for "does not error".
3. Run the project's migration linter and drift check if it has them ([tools.md](tools.md) -> Linting and Drift Checks).
4. Run the tests that touch the changed tables (owned by backend-test).

Report anything not run as "did not run" with the reason; never claim it passed.

### Staging (Always Ask First)

Staging is not provably local. Run there only after approval, against a copy that mirrors production volume:

- [ ] Migration completes without errors.
- [ ] Runtime fits the deploy window; no long-held locks (watch `pg_locks` / `pg_stat_activity`).
- [ ] Down migration succeeds for reversible steps.
- [ ] Application health checks pass, with old and new code both running against the expanded schema.

### Validate Constraints and Indexes

```sql
-- invalid indexes on PostgreSQL
SELECT indexrelid::regclass AS index_name, indrelid::regclass AS table_name
FROM pg_index WHERE NOT indisvalid;

-- constraint states
SELECT conname, convalidated FROM pg_constraint
WHERE conrelid = 'users'::regclass;
```

### Check Query Plans

A new index or column type can change optimizer behavior. Use plain `EXPLAIN` by default; it does not run the statement.

```sql
EXPLAIN SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT 100;
```

- `EXPLAIN ANALYZE` executes the statement. Use it only on a local or disposable database, and for INSERT, UPDATE or DELETE only inside `BEGIN; ... ROLLBACK;`.
- Never run `EXPLAIN ANALYZE` against a non-local database without asking, and never on DML there.
- Compare plans before and after the migration and confirm the chosen plan is still efficient.
