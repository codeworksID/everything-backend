# Expand/Contract and Renames

Use expand/contract whenever you replace a structure (rename, type change, split, move) without downtime. Each phase ships as its own migration and release. Never put expand and contract in one migration.

## Phases

| # | Phase | Kind | Runs | Reversible |
|---|-------|------|------|------------|
| 1 | Expand: add the new column/table/index alongside the old one, nullable, with the old structure's constraints mirrored (see Carry Constraints) | schema, expand | pre-deploy | yes (drop the new, empty structure) |
| 2 | Dual-write: deploy code that writes old and new on every insert and update | app release | deploy | yes |
| 3 | Backfill: copy existing rows in batches ([backfills.md](backfills.md)) | data | after dual-write is live everywhere | yes, while the old structure exists |
| 4 | Parity check: mismatch count must be 0 | read-only | before step 5 | n/a |
| 5 | Switch reads: deploy code that reads the new structure, still dual-writing | app release | deploy | yes |
| 6 | Stop writing old: deploy code that writes only the new structure (first relax old NOT NULL) | app release | deploy | yes |
| 7 | Contract: drop the old structure, in a LATER release, behind the Contract Gate | schema, contract | post-deploy, after all instances run step-6 code | NO: one-way |

Dual-write is required, not optional. A backfill alone misses every row written after it runs, and the contract DROP then deletes the only copy.

## Example: rename `users.email` to `contact_email`

`users.email` is `TEXT UNIQUE NOT NULL`. Each block is a separate migration or release.

```sql
-- release 1, migration A (expand, pre-deploy): nullable, metadata-only
ALTER TABLE users ADD COLUMN contact_email TEXT;

-- release 1, migration B (expand, pre-deploy): mirror UNIQUE without blocking writes
-- one statement per file, outside a transaction block
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

-- release 3, migrations C1-C3 (pre-deploy of release 3): carry NOT NULL safely.
-- Only after parity = 0 and dual-write code runs on every instance, including
-- rollback targets: the NOT VALID CHECK rejects new rows from any writer that
-- still leaves contact_email NULL.
-- C1: brief lock, no scan
ALTER TABLE users ADD CONSTRAINT users_contact_email_not_null
  CHECK (contact_email IS NOT NULL) NOT VALID;
-- C2: separate transaction; scans without blocking writes
ALTER TABLE users VALIDATE CONSTRAINT users_contact_email_not_null;
-- C3: PostgreSQL 12+ uses the validated CHECK, so no scan
ALTER TABLE users ALTER COLUMN contact_email SET NOT NULL;
ALTER TABLE users DROP CONSTRAINT users_contact_email_not_null;

-- release 3 (after C1-C3): application reads contact_email, still dual-writes

-- release 4, migration D (expand, pre-deploy): old column must accept missing writes
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
-- release 4: application writes contact_email only

-- release 5 (later, after the Contract Gate): contract, post-deploy, one-way
ALTER TABLE users DROP COLUMN email;
```

## Trigger-based dual-write

When application dual-write is impractical (many writers, legacy services), a `BEFORE INSERT OR UPDATE` trigger can copy `email` into `contact_email` while every writer still writes the old column.

- Before removing the trigger, switch every writer to dual-write (or to writing the new column). Re-run the parity check after removal. Removing it while some writers still write only `email` silently drops their updates to `contact_email`.
- Do not let any writer write only the new column while a one-way trigger is active, or the trigger will overwrite new values.
- If writers move over gradually, use a trigger that copies whichever column changed (compare `NEW` with `OLD`) for the transition.

## Renames in one step

`ALTER TABLE ... RENAME COLUMN` is instant but breaks every running instance that uses the old name. Use it only when all readers and writers can switch atomically, for example during planned downtime.

## Carry Constraints and Dependents

A rename or replacement column must end up with everything the old one had:

- `NOT NULL` (validated CHECK path), `UNIQUE` (unique index built concurrently; add `ADD CONSTRAINT ... UNIQUE USING INDEX <name>` if foreign keys must reference it), `CHECK` constraints, defaults, and every index that includes the old column, including partial and composite indexes.
- Foreign keys from or to the column: add the new FK as `NOT VALID`, then `VALIDATE CONSTRAINT` in a separate transaction.
- Dependents to update before contract: views, materialized views, triggers, functions and procedures, generated columns, row-level security policies, publications and CDC connectors, analytics and ETL consumers, ORM mappings and serializers, and raw SQL in code.

Find dependent views and materialized views on PostgreSQL. Function bodies are not tracked here, so also search `pg_proc.prosrc` and the codebase.

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

## Contract Gate

Before any DROP of a column, table, index or constraint, every box must be checked:

- [ ] No code path, query, view, trigger or consumer references the old structure (codebase search plus the dependents query above).
- [ ] At least one release has run in production without reading or writing it, and every instance runs that release.
- [ ] Backup gate: a restorable backup or snapshot taken after the last write to the old structure exists, or point-in-time recovery covers that moment. Confirm its time and that a restore has been tested recently; if not, ask the user to take one first. If no backup or PITR exists, stop and route the user to backend-ops (its backup and DR guidance, `backend-ops/references/backup-dr.md`).
- [ ] The down migration is marked one-way: it can recreate the structure but not the data.
- [ ] The user confirmed the drop (`<shared>/tool-rules.md` -> Always Ask First).

Record the gate result in the phase plan ([phase-plan.md](phase-plan.md)).
