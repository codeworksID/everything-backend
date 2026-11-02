# Multi-Tenancy

Read this when the product is SaaS or any data belongs to an organization, workspace or account that must be isolated from others.

## 1. Choose the Tenancy Model

Decide first and record it in `decisions.md`.

| Model | Use when | Cost |
|---|---|---|
| Shared tables with `tenant_id` (default) | Many small or medium tenants | Isolation depends on every query being scoped; add RLS as a second layer |
| Schema per tenant | Few tenants needing stronger separation or per-tenant extensions | Migrations run once per schema; connection routing per tenant |
| Database per tenant | Regulatory isolation, very large tenants, per-tenant backup and restore | Highest operational cost; fleet-wide migrations and monitoring |

## 2. Shared-Table Rules

- Every tenant-owned table has `tenant_id NOT NULL` with a FK to `tenants`, including child and junction tables.
- Unique constraints include `tenant_id`: `UNIQUE (tenant_id, email)`, not `UNIQUE (email)`.
- Indexes lead with `tenant_id` for tenant-scoped query patterns: `(tenant_id, status, created_at DESC)`.
- FKs between tenant-owned tables include `tenant_id`, so a child cannot point at another tenant's parent:

  ```sql
  ALTER TABLE posts ADD CONSTRAINT posts_tenant_id_id_key UNIQUE (tenant_id, id);

  CREATE TABLE comments (
      id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants (id),
      post_id   uuid NOT NULL,
      body      text NOT NULL,
      FOREIGN KEY (tenant_id, post_id) REFERENCES posts (tenant_id, id)
  );
  ```

- Every query is scoped by `tenant_id` taken from the verified auth context, never from the request body or path. Enforce it in a tenant-scoped repository or query layer.
- Admin roles are scoped to a tenant unless a platform-admin role is explicitly designed and audited. `backend-auth` owns that authorization model.

## 3. PostgreSQL Row-Level Security (Second Layer)

```sql
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts FORCE ROW LEVEL SECURITY;   -- needed if the app role owns the table

CREATE POLICY tenant_isolation ON posts
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
```

- `NULLIF` matters: on a pooled connection where the setting was set in an earlier transaction, it reads back as `''`, and `''::uuid` errors. With `NULLIF`, an unset tenant returns no rows.
- `WITH CHECK` stops inserts and updates into another tenant.
- The app role must not be a superuser and must not have `BYPASSRLS`.
- Set the tenant per transaction with a parameterized `SELECT set_config('app.tenant_id', $1, true)`. The `true` makes it transaction-local, so pooled connections do not leak it. Do not use `SET LOCAL` with an interpolated literal.
- Migrations and maintenance jobs run as a separate role; document which role bypasses RLS and why.

## 4. Required Tests

Hand these to `backend-test`:

- Tenant A cannot read, update or delete tenant B's rows by ID (expect 404, not 403, unless the API design says otherwise).
- List and search endpoints return only the caller's tenant.
- Creating a child that references another tenant's parent fails.
- With RLS on: a query with no tenant set returns no rows.

## 5. Plan Notes for backend-migrate

Adding `tenant_id` to existing tables is an expand/contract change: add nullable, backfill in batches, validate, then set `NOT NULL` with migrate's safe NOT NULL procedure. Composite unique constraints and new FKs on large tables follow migrate's lock-safe rules (`NOT VALID` then `VALIDATE`).
