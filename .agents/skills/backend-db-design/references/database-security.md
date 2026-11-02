# Database-Side Security

Read this in Step 4 for every design an application reaches over the network (almost all of them), and always when data is tenant- or user-owned or the design includes functions, triggers or views.

These are the database layers under `<shared>/sql-safety.md`. They limit the damage when a query is wrong; they never replace bound parameters, allowlisted identifiers and owner predicates in the application's queries (sql-safety rules 1-4). This file adds the schema-design detail for `_shared/sql-safety.md -> The Rules` rules 8 and 11.

## 1. Separate Roles with Least Privilege (sql-safety rule 11)

Use at least two roles. Names below are examples; match the project's naming.

| Role | Used by | Can |
|---|---|---|
| `app_owner` (migration role) | Migration job / CI only | Owns the schema and every object; runs DDL. Never used by the running service; its credentials are not in the app's runtime environment. |
| `app_runtime` (application role) | The running service | DML on its own schema only. Owns nothing. |
| `app_readonly` (optional) | Reports, analytics, support tools | `SELECT` only, ideally on a replica. |

PostgreSQL grants (role creation and passwords are an infrastructure step; passwords come from the secret manager, never from a migration file):

```sql
CREATE ROLE app_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;

REVOKE ALL ON DATABASE app FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;            -- default only from PostgreSQL 15
GRANT CONNECT ON DATABASE app TO app_runtime;
GRANT USAGE ON SCHEMA app TO app_runtime;              -- USAGE, not CREATE: no DDL
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO app_runtime;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA app TO app_runtime;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA app
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA app
    GRANT USAGE ON SEQUENCES TO app_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA app
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

Application role rules:

- No DDL: no `CREATE` on any schema, and it owns no tables (an owner can `ALTER`, `DROP` and, without `FORCE`, skip RLS).
- No `SUPERUSER`, `BYPASSRLS`, `CREATEROLE`, `CREATEDB` or `REPLICATION`.
- Not a member of `pg_read_server_files`, `pg_write_server_files`, `pg_execute_server_program`, `pg_read_all_data` or `pg_write_all_data`. No `COPY ... TO/FROM PROGRAM` or file access.
- Narrow grants where the table needs it: append-only tables (`audit_log`, ledgers) get `SELECT, INSERT` only; lookup tables get `SELECT` only.
- No access to other tenants' schemas (schema-per-tenant model): one role per tenant schema, or a routing layer that never grants cross-schema.
- `EXECUTE` on functions is granted one by one, never left to `PUBLIC`.

Other databases:

- **MySQL**: `GRANT SELECT, INSERT, UPDATE, DELETE ON app.* TO 'app_runtime'@'<app hosts>'`. No `FILE`, `SUPER`, `PROCESS`, `GRANT OPTION` or `ALL PRIVILEGES`; keep `multipleStatements` off in the driver.
- **MongoDB**: a custom role with `find`, `insert`, `update`, `remove` on the app database only; never `root`, `dbAdmin`, `readWriteAnyDatabase` or `userAdmin`. Disable server-side JavaScript (`security.javascriptEnabled: false`) when nothing needs it.
- **Redis**: an ACL user limited to the commands and key patterns the app uses (for example `~app:* -@all +@read +@write -@dangerous`); disable or password-protect the `default` user.

## 2. Timeouts per Role

A crafted or unindexed query must not hold connections or locks. Set limits on the role so every connection gets them:

```sql
ALTER ROLE app_runtime  SET statement_timeout = '5s';
ALTER ROLE app_runtime  SET lock_timeout = '2s';
ALTER ROLE app_runtime  SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE app_readonly SET statement_timeout = '60s';
```

- Pick values from the latency targets in Step 2; these are starting points.
- Long reports use `app_readonly` or a replica; do not raise the app role's limit for them. A single known-slow operation may raise it with a parameterized `SELECT set_config('statement_timeout', $1, true)` inside its transaction.
- Migration timeouts are set per migration by `backend-migrate` (`lock_timeout`), not here.
- MySQL: `max_execution_time` (SELECT only) per session or per query hint. MongoDB: `maxTimeMS` on queries.

## 3. Row-Level Security as Defense in Depth

For shared-table multi-tenancy, put RLS on every tenant-owned table, including child and junction tables. The policy SQL and the pooled-connection rules are in `references/multi-tenancy.md` -> PostgreSQL Row-Level Security.

- RLS is the second layer. Application queries still bind `tenant_id` (and the owning `user_id` for user-owned rows) from the authenticated principal (sql-safety rule 3). RLS fails silently as empty results, and a later migration can drop or loosen a policy.
- Use `FORCE ROW LEVEL SECURITY` too, so the policy holds even if ownership is ever misassigned.
- User-owned rows in a single-tenant app use the same pattern with `app.user_id`.
- Views: create them with `WITH (security_invoker = true)` (PostgreSQL 15+). A view without it runs as its owner and can bypass the caller's RLS.
- Record in `decisions.md` which roles bypass RLS (normally only `app_owner` for migrations) and why.

## 4. Functions, Triggers and Dynamic SQL (sql-safety rule 8)

- Prefer `SECURITY INVOKER` (the default). Use `SECURITY DEFINER` only when the function must do something the caller cannot, and then:
  - set a fixed `search_path` on the function (`SET search_path = ''` with every name schema-qualified, or `pg_catalog, app, pg_temp`), so a caller cannot plant a same-named object in another schema;
  - own it with a dedicated `NOLOGIN` role that has only the privileges the function needs, never a superuser;
  - check the owner inside the function, since it may bypass the caller's RLS;
  - `REVOKE EXECUTE ... FROM PUBLIC` and grant to the roles that need it.
- Dynamic SQL in PL/pgSQL uses `format('%I', ident)` for identifiers (after an allowlist check) and `USING` for values. Never `EXECUTE '... ' || p_value`.

```sql
CREATE FUNCTION app.archive_post(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE app.posts
       SET archived_at = now()
     WHERE id = p_post_id
       AND tenant_id = NULLIF(pg_catalog.current_setting('app.tenant_id', true), '')::uuid;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.archive_post(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.archive_post(uuid) TO app_runtime;
```

## 5. Plan Rows, Checks and Tests

- Migration plan (Step 7): list grants, `ALTER DEFAULT PRIVILEGES`, role settings, RLS policies and function definitions as raw-SQL steps for `backend-migrate`. Role creation and credentials are an infrastructure step for `backend-deploy`; say so in the plan.
- Verify a live PostgreSQL design (read-only queries, only when the user allows a connection):

  ```sql
  SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
    FROM pg_roles WHERE rolname = 'app_runtime';            -- all false

  SELECT p.oid::regprocedure
    FROM pg_proc p
   WHERE p.prosecdef
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
                      WHERE c LIKE 'search_path=%');         -- expect no rows
  ```

- Hand to `backend-test`: as the app role, `CREATE TABLE` and `DROP TABLE` fail; a query with no tenant set returns no rows; another tenant's id returns nothing; `SELECT pg_sleep(10)` is cancelled by `statement_timeout`.
